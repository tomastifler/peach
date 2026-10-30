"""给 Feed 发现的番号取一份资料和封面（ADR-0042 第六条）。

拉取只解出番号，壳上除了番号什么都没有——没有标题就没法在页面上认出这是哪一部。
这条后继把标题、女优、厂牌、发行日与封面地址取回来写进壳，再把封面装进本机封面目录。

**一轮拉取一条后继。** 同一轮发现的番号在活动页上是一件事，拆成一部一条，一次订阅
就是二十张一模一样的卡片；键里带着这一批的番号，重跑、去重都按这一批算。

**Cover backfill is queued separately. ** Shells whose metadata is complete and only lack a local cover do not join the metadata batch, and are dispatched as a separate
`feed-cover` (backfill new-release covers): it only fetches images, does not ask any metadata source, does not write the ledger, and uses its own channel. When the metadata source
 is unreachable, fetching metadata waits one timeout per item, and if cover backfill follows behind it, old shells get squeezed out by a steady stream of new codes and never get a turn.
 Codes already queued or running (`in_flight`) do not enter the next batch, and the two kinds of batch do not repeat each other.

**不复用 `process_library`**：那条路以 `asset` 行为单位、要写候选 CSV、要按字段优先级链
结算到真相字段，而壳没有真相字段可写。壳上的每个值都只是「某个来源这么说」，用户复核
的时机是文件真的到手、建成 `asset` 之后。所以这里只借来源链本身
（`metadata_routes`）和发请求那一层（`library_processing.LibraryMetadataProvider`），
不借结算。

**封面走馆藏那一条。** 官方候选复用 `jav_cover_fetch.best_cover`，来源图复用详情的身份校验与缓存，落盘是
`cover_artwork.install_cover`：书脊折痕的正封框与人脸位置随图一起写进边车，新作卡和
资产卡按同一份边车取景。文件到手、建成 `asset` 之后，这张封面原样就是它的封面。

幂等（ADR-0040 第六条要求）：重跑一次只是把同样的值再写一遍，本机已有的封面不再取；
壳已经不在了就跳过那一部。
"""
from __future__ import annotations

import hashlib
import json
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from . import feeds, metadata_routes
from .catalog_rules import normalise_code_key
from .followups import Followup, FollowupType, register
from .metadata import extract_peach_fields

TASK_KEY = "feed-scrape"
TASK_LABEL = "Fetch new-release metadata"
COVER_TASK_KEY = "feed-cover"
COVER_TASK_LABEL = "Backfill new-release covers"
LABELS = {TASK_KEY: TASK_LABEL, COVER_TASK_KEY: COVER_TASK_LABEL}

#: 一条资料够用就停。四个标量都拿到就不再问下一家——Feed 是后台跑的，
#: 多问一家换来的是配额，而壳上的值本来就不是真相字段。
WANTED = ("title", "performers", "studio", "release_date")

#: How many titles a batch carries at most. In the metadata batch the newly discovered go first, and the remaining slots go to those that failed to get metadata last time and have reached their retry time
#: old shells; the cover batch is ordered by last attempt from oldest to newest.
MAX_BATCH = 24

#: Slots the metadata batch reserves at minimum for retrying old shells. A feed round can discover dozens of new codes; without the reservation not even one old shell
#: would get a turn: those that never got metadata would stay on the page without titles forever.
RETRY_SHARE = 6

#: 缺封面或上次没取到资料的壳，定时拉取隔多久再试一次。新片的封面常常晚于番号出现，
#: 所以不是试一次就放弃；但也不该每拉一轮源就把同一批再问一遍。人手点的那一次不等：
#: 点「检查」本身就是要现在取。
RETRY_AFTER = timedelta(hours=12)

#: How long a single cover may wait at most. One stuck item must not hold up the whole batch behind it.
COVER_SECONDS = 30


def followup_key(codes, task_key: str = TASK_KEY) -> str:
    return f"{task_key}:{','.join(codes)}"


def parse_key(key: str, task_key: str = TASK_KEY) -> list[str]:
    prefix, _, body = str(key).partition(":")
    codes = [code for code in body.split(",") if code]
    if prefix != task_key or not codes:
        raise ValueError(f"Unrecognized {LABELS.get(task_key, task_key)} successor: {key}")
    return codes


def _label(codes: list[str], task_key: str = TASK_KEY) -> str:
    name = LABELS[task_key]
    if len(codes) == 1:
        return f"{name}: {codes[0]}"
    return f"{name}: {codes[0]} and others, {len(codes)} titles in all"


def plan(codes, task_key: str = TASK_KEY) -> list[Followup]:
    """一批番号合成一条后继；一部都没有就不派。"""
    batch = list(dict.fromkeys(code for code in codes if code))[:MAX_BATCH]
    if not batch:
        return []
    return [Followup(key=followup_key(batch, task_key), task_key=task_key,
                     label=_label(batch, task_key))]


def plan_covers(codes) -> list[Followup]:
    return plan(codes, COVER_TASK_KEY)


def in_flight(task_runs) -> set[str]:
    """Code keys in the queued or running metadata and cover-backfill successors. The next batch no longer includes them."""
    codes: set[str] = set()
    for task_key in (TASK_KEY, COVER_TASK_KEY):
        for run in task_runs.query(status="active", task_key=task_key, limit=500):
            try:
                codes.update(normalise_code_key(code) for code in parse_key(run.followup_key, task_key))
            except ValueError:
                continue
    return codes


def has_local_cover(cover_root: Path, code: str) -> bool:
    from .library_processing import cover_settled
    key = normalise_code_key(code)
    return bool(key) and cover_settled(Path(cover_root) / f"{key}.jpg")


def scrape_batch(connection, fresh=(), *, exclude=(), now: datetime | None = None,
                 retry_after: timedelta = RETRY_AFTER,
                 hidden: frozenset[str] = feeds.DEFAULT_HIDDEN_COMPILATIONS) -> list[str]:
    """Codes for the next metadata batch: this round's newly discovered `fresh` and shells without metadata so far go first; shells that failed to get metadata last time,
    and whose `retry_after` has passed go after them, with at least `RETRY_SHARE` slots reserved for the latter. Shells whose metadata is complete and only lack
    Covers belong to `cover_backlog`.

    已忽略的不算：人说了不想看，就不再替它花配额。已经入库的壳本来就不在表里
    （入库即从列表里消失，ADR-0042 第三条），这里同样用番号键排除掉。取回标题后认出是
    Collections collapsed in settings (`hidden`) do not count either: the page does not list them, so quota spent backfilling their metadata is wasted;
    开关打开后下一轮就轮到它。
    """
    moment = now or datetime.now(timezone.utc)
    cutoff = feeds.stamp(moment - retry_after)
    fresh = list(dict.fromkeys(code for code in fresh if code))
    skip = [*exclude, *fresh]
    untried = _first(_candidates(connection, "d.scraped_at IS NULL", (), ""),
                     skip, hidden, MAX_BATCH)
    retries = _first(_candidates(connection, "d.scrape_error IS NOT NULL AND d.scraped_at<?",
                                 (cutoff,), "d.scraped_at, "), skip, hidden, MAX_BATCH)
    head = [*fresh, *untried][:MAX_BATCH - min(len(retries), RETRY_SHARE)]
    return head + retries[:MAX_BATCH - len(head)]


def _first(rows, exclude, hidden, limit: int) -> list[str]:
    found: list[str] = []
    for row in _visible(rows, exclude, hidden):
        found.append(row["code"])
        if len(found) >= limit:
            break
    return found


def cover_backlog(connection, cover_root: Path, *, exclude=(), now: datetime | None = None,
                  limit: int = MAX_BATCH, retry_after: timedelta = RETRY_AFTER,
                  hidden: frozenset[str] = feeds.DEFAULT_HIDDEN_COMPILATIONS) -> list[str]:
    """Shells whose metadata is complete, that have no local cover yet, and whose last image fetch is already past `retry_after`.

    The last image-fetch time is read from the per-code fetch records (`record_cover_attempt`), never-tried ones come first, the rest from oldest to newest;
    Among equally old ones, newer releases go first. The exclusion rules are the same as `scrape_batch`.
    """
    from .catalog_rules import is_korean_mib_code

    cutoff = (now or datetime.now(timezone.utc)).timestamp() - retry_after.total_seconds()
    rows = _candidates(connection, "d.scraped_at IS NOT NULL AND d.scrape_error IS NULL", (), "")
    due: list[tuple[float, int, str]] = []
    for position, row in enumerate(_visible(rows, exclude, hidden)):
        code = row["code"]
        key = normalise_code_key(code)
        if not key or is_korean_mib_code(key) or has_local_cover(cover_root, code):
            continue
        try:
            attempted = cover_attempt_path(cover_root, key).stat().st_mtime
        except OSError:
            attempted = 0.0
        if attempted < cutoff:
            due.append((attempted, position, code))
    return [code for _, _, code in sorted(due)[:limit]]


def _candidates(connection, condition: str, values: tuple, order: str):
    return connection.execute(
        "SELECT d.code,d.title,d.performers,d.studio FROM feed_discovery d"
        f" WHERE d.ignored_at IS NULL AND {condition}"
        " AND NOT EXISTS (SELECT 1 FROM asset a WHERE a.code IS NOT NULL"
        " AND COALESCE(a.disposal,'')<>'vanished'"
        " AND normalise_code_key(a.code)=normalise_code_key(d.code))"
        f" ORDER BY {order}COALESCE(d.release_date,d.discovered_at) DESC, d.id DESC",
        values).fetchall()


def _visible(rows, exclude, hidden):
    skip = {normalise_code_key(code) for code in exclude}
    for row in rows:
        if normalise_code_key(row["code"]) in skip or feeds.compilation_kind(
                row["title"], row["performers"], row["studio"]) in hidden:
            continue
        yield row


def _cover(payload: dict) -> str | None:
    for field in ("cover_url", "cover"):
        value = str(payload.get(field) or "").strip()
        if value:
            return value
    urls = payload.get("cover_urls")
    if isinstance(urls, list):
        for value in urls:
            text = str(value or "").strip()
            if text:
                return text
    return None


def collect(provider, code: str) -> tuple[dict, str | None]:
    """按番号问来源链，返回 (字段, 封面地址)。

    问哪几家由 `metadata_routes` 决定，与刮削链同一份判据；这里没有本机证据可给，
    所以只传番号本身。一家都没给就抛——调用方把原因写进壳的 `scrape_error`，
    页面上那一行因此能说清是「还没取」还是「取不到」。

    How long a single title may query at most shares one budget with library metadata processing (`ACTION_BUDGETS['querying_metadata']`):
    When sources are unreachable each one waits out its timeout and then backs off and retries; without a cap a single title can burn several minutes, and the whole batch and the ones behind it
    successors all wait along.
    """
    from .jav_cover_fetch import DeadlineExceeded
    from .library_processing import ACTION_BUDGETS
    from .processing_control import deadline_after

    chain = metadata_routes.route_for_code(code)
    budget = ACTION_BUDGETS["querying_metadata"]
    try:
        found = provider.community(
            code, deadline=deadline_after(budget),
            route=metadata_routes.community_route(code))
    except DeadlineExceeded as error:
        raise DeadlineExceeded(
            f"Source chain {', '.join(chain)} did not answer within {budget:g} seconds") from error
    fields: dict[str, object] = {}
    cover: str | None = None
    for _source, payload in found:
        if not isinstance(payload, dict):
            continue
        cover = cover or _cover(payload)
        for name, item in extract_peach_fields(payload).items():
            if name in WANTED and name not in fields:
                fields[name] = item.get("value")
        if all(name in fields for name in WANTED):
            break
    if not fields and cover is None:
        raise ValueError(f"None of the sources in the chain {', '.join(chain)} has data for this code")
    return fields, cover


def fetch_cover(contract, code: str,
                cover_url: str | None = None) -> tuple[bytes, tuple[int, int], dict]:
    """取得当前作品的官方封面与来路。

    `cover_url` 是取资料那一步来源给的地址，它是官方图路径时一起参与择优。`DAZD-308`
    这类番号 r18 与本机快照里都没有，官方渠道一条候选也列不出来，来源给的却正是 DMM 那张
    封套；不收它，这部就只能在页面上拿远程图按固定比例切，书脊切不干净。
    取不到就抛；原因交给调用方记账，一部取不到不影响同批其余几部。
    """
    from .jav_cover_fetch import HostLimitedTransport, best_cover, official_image_candidates
    from .scraping_access import SourceTransport

    raw = SourceTransport(contract.follow_secrets_root, max_requests=40,
                          max_bytes=32 * 1024 * 1024, max_seconds=COVER_SECONDS)
    transport = HostLimitedTransport(raw, 1.0)
    from .cover_artwork import metadata_snapshots
    from .library_processing import _official_evidence, artwork_title
    snapshots = metadata_snapshots(contract.follow_sources_root / 'library-metadata', code)
    try:
        candidate, size, data = best_cover(
            transport, code, 0,
            metadata_root=contract.follow_sources_root / "metadata" / "javinizer-go",
            known=_official_evidence(snapshots),
            prior_candidates=tuple(official_image_candidates(cover_url or "")),
            deadline=time.monotonic() + COVER_SECONDS)
    finally:
        transport.close()
    digest = hashlib.sha256(data).hexdigest()
    evidence = {"code": code, "width": size[0], "height": size[1],
                "title": artwork_title(snapshots),
                "source": candidate.source, "source_url": candidate.url,
                "raw_sha256": digest, "installed_sha256": digest,
                "checked_at": time.time(), "resolver": "peach-jav-cover-v1"}
    return data, size, evidence


def cover_attempt_path(cover_root: Path, code: str) -> Path:
    return Path(cover_root).parent / 'feed-cover-attempts' / (normalise_code_key(code) + '.json')


def record_cover_attempt(contract, code: str, *, ok: bool, error=None):
    """Save cover processing results per code; request credentials and source response bodies are not recorded. The file time is the last fetch time that `cover_backlog`
    judges retries."""
    from .fsutil import atomic_write_text
    path = cover_attempt_path(contract.cover_root, code)
    path.parent.mkdir(parents=True, exist_ok=True)
    record = {'code': code, 'checked_at': time.time(), 'ok': ok}
    if error is not None:
        from .jav_cover_fetch import Unavailable
        from .javdb_public import PublicSourceUnavailable
        from .remote_media_cache import RemoteMediaUnavailable
        import httpx
        reason = (re.sub(r'https?://\S+', 'source URL', str(error)) if isinstance(error, (Unavailable, PublicSourceUnavailable, RemoteMediaUnavailable))
                  else 'source connection failed' if isinstance(error, httpx.TransportError) else 'cover processing did not finish')
        record.update(error_type=type(error).__name__, reason=reason[:300])
    atomic_write_text(path, json.dumps(record, ensure_ascii=False))


def ensure_cover(contract, code: str, cover_url: str | None = None) -> bool:
    """本机还没有这个番号的封面就去取来装上。返回这一部现在有没有封面。"""
    from .catalog_rules import is_korean_mib_code
    from .cover_artwork import install_cover

    key = normalise_code_key(code)
    if not key or is_korean_mib_code(key):
        return False
    if has_local_cover(contract.cover_root, key):
        return True
    try:
        data, size, evidence = fetch_cover(contract, key, cover_url)
        with contract.database.read_connection() as connection:
            row = connection.execute('SELECT title FROM feed_discovery WHERE code=?', (key,)).fetchone()
        if row and not evidence.get('title'):
            evidence = {**evidence, 'title': row['title']}
        from .community_catalog import origin_of
        from .images import measure_image_file
        target = Path(contract.cover_root) / f'{key}.jpg'
        kept = measure_image_file(target)
        incoming_community = origin_of(str(evidence.get('source_url') or '')) in ('javdb', 'javbus')
        if kept and incoming_community and size[0] * size[1] <= kept[0] * kept[1]:
            record_cover_attempt(contract, key, ok=True)
            return True
        install_cover(target, key, data, size, evidence=evidence)
    except Exception as error:
        record_cover_attempt(contract, key, ok=False, error=error)
        raise
    record_cover_attempt(contract, key, ok=True)
    return True


def performer_names(value: object) -> list[str]:
    if isinstance(value, list):
        return [str(item.get("name") or "") if isinstance(item, dict) else str(item)
                for item in value]
    return []


def _scrape_fields(contract, provider, row) -> bool:
    """取一部的资料写进壳。返回取没取到；取不到的原因写在壳的 `scrape_error` 上。"""
    code = row["code"]
    try:
        fields, cover = collect(provider, code)
    except Exception as error:  # noqa: BLE001 - 原因要写到壳上给人看
        with contract.database.write_transaction() as connection:
            connection.execute(
                "UPDATE feed_discovery SET scrape_error=?,scraped_at=? WHERE id=?",
                (str(error), feeds.stamp(), int(row["id"])))
        return False
    names = performer_names(fields.get("performers"))
    with contract.database.write_transaction() as connection:
        connection.execute(
            "UPDATE feed_discovery SET title=COALESCE(?,title),cover_url=COALESCE(?,cover_url),"
            "studio=COALESCE(?,studio),release_date=COALESCE(?,release_date),"
            "performers=COALESCE(?,performers),scrape_error=NULL,scraped_at=? WHERE id=?",
            (fields.get("title") or None, cover, fields.get("studio") or None,
             fields.get("release_date") or None, "、".join(name for name in names if name) or None,
             feeds.stamp(), int(row["id"])))
        for entity_id in feeds.match_performers(connection, names):
            feeds.link_entity(connection, int(row["id"]), entity_id)
    return True


def run(contract, key: str, handle) -> dict:
    """跑一批取资料。返回的摘要就是活动页上那一行：几部、取到几部、装上几张封面。

    封面断在连接上的几部另记 `cover_network`：这一类换条线路就能取到，新作页据此提示
    去配来源的连接方式，而不是让人以为官方没出图。

    The checkpoint records the codes already tried in this batch, whether or not they were fetched: when this item is claimed again after a service restart it only continues with
    the remaining ones. Those not fetched are rescheduled by `scrape_batch`, `cover_backlog` once their retry time arrives, rather than being
    burned through again on every restart in a resumed run of the same batch.
    """
    import httpx

    from .jav_cover_fetch import CoverConnectError
    from .library_processing import LibraryMetadataProvider

    codes = parse_key(key)
    provider = None
    saved = getattr(handle, 'saved', {})
    saved = saved if isinstance(saved, dict) else {}
    done = set(saved.get('done_codes') or [])
    fetched, covers = saved.get('fetched', 0), saved.get('covers', 0)
    missed, unreachable = saved.get('miss', 0), saved.get('cover_network', 0)
    for index, code in enumerate(codes):
        if code in done:
            continue
        handle.progress(current=index, total=len(codes),
                        label=f"{TASK_LABEL}: {code}", throttle=0)
        with contract.database.read_connection() as connection:
            row = connection.execute(
                "SELECT id,code,scraped_at,scrape_error FROM feed_discovery WHERE code=?",
                (code,)).fetchone()
        if row is None:
            # 壳被删了，或者这个番号这中间已经入库。两种都不该再取一遍。
            continue
        if row["scraped_at"] is None or row["scrape_error"] is not None:
            provider = provider or LibraryMetadataProvider(contract.follow_secrets_root)
            if _scrape_fields(contract, provider, row):
                fetched += 1
            else:
                missed += 1
        # 封面地址在取资料那一步才写上壳，所以取完再读一遍，不用循环开头那份。
        with contract.database.read_connection() as connection:
            cover_url = connection.execute(
                "SELECT cover_url FROM feed_discovery WHERE id=?", (int(row["id"]),)).fetchone()
        try:
            covers += ensure_cover(contract, code, cover_url[0] if cover_url else None)
        except (CoverConnectError, httpx.TransportError):
            unreachable += 1
        except Exception:  # noqa: BLE001 - 取不到封面这一部照样有资料，下一轮再试
            pass
        # Record this attempt; ones that did not get metadata are retried by `scrape_batch` according to it, waiting `RETRY_AFTER` before trying again; cover retries look at the fetch records instead.
        with contract.database.write_transaction() as connection:
            connection.execute("UPDATE feed_discovery SET scraped_at=? WHERE id=?",
                               (feeds.stamp(), int(row["id"])))
        done.add(code)
        handle.checkpoint(done_codes=sorted(done), fetched=fetched, covers=covers,
                          miss=missed, cover_network=unreachable)
    handle.progress(current=len(codes), total=len(codes), label=TASK_LABEL, throttle=0)
    contract.cache_bust()
    summary = {"total": len(codes), "ok": fetched, "miss": missed, "covers": covers}
    if unreachable:
        summary["cover_network"] = unreachable
    return summary


def run_covers(contract, key: str, handle) -> dict:
    """Run one cover-backfill batch: only fetch images into the local cover directory, ask no metadata source and do not write the ledger. The summary is the same as the metadata row,
    Those that could not reach the image host are likewise recorded separately in `cover_network`."""
    import httpx

    from .jav_cover_fetch import CoverConnectError

    codes = parse_key(key, COVER_TASK_KEY)
    saved = getattr(handle, 'saved', {})
    saved = saved if isinstance(saved, dict) else {}
    done = set(saved.get('done_codes') or [])
    covers = saved.get('covers', 0)
    unreachable = saved.get('cover_network', 0)
    for index, code in enumerate(codes):
        if code in done:
            continue
        handle.progress(current=index, total=len(codes),
                        label=f"{COVER_TASK_LABEL}: {code}", throttle=0)
        with contract.database.read_connection() as connection:
            row = connection.execute(
                "SELECT cover_url FROM feed_discovery WHERE code=? AND ignored_at IS NULL",
                (code,)).fetchone()
        if row is not None:
            try:
                covers += ensure_cover(contract, code, row["cover_url"])
            except (CoverConnectError, httpx.TransportError):
                unreachable += 1
            except Exception:  # noqa: BLE001 - the reason is in the fetch record; it is rescheduled when the retry time arrives
                pass
        done.add(code)
        handle.checkpoint(done_codes=sorted(done), covers=covers, cover_network=unreachable)
    handle.progress(current=len(codes), total=len(codes), label=COVER_TASK_LABEL, throttle=0)
    contract.cache_bust()
    summary = {"total": len(codes), "covers": covers}
    if unreachable:
        summary["cover_network"] = unreachable
    return summary


#: 写账本：壳与实体关联都在 `ledger.db` 里，所以它走串行那条通道。
TYPE = register(FollowupType(task_key=TASK_KEY, label=TASK_LABEL,
                             writes_ledger=True, run=run))
#: Cover backfill writes only the cover directory and the fetch records, uses its own channel, and is not queued behind successors that write the ledger.
COVER_TYPE = register(FollowupType(task_key=COVER_TASK_KEY, label=COVER_TASK_LABEL,
                                   writes_ledger=False, run=run_covers))
