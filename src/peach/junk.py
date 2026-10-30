"""Physical media junk evidence and review scoring; scanning, post-processing and pages share one set of rules."""
from __future__ import annotations

import json
import re
import time
from functools import cache
from pathlib import PureWindowsPath

from .catalog_rules import is_jav_code, promo_free_key, release_code_from_filename
from .media_sources import SCANNABLE_LOCATIONS
from .settings_file import PROJECT_ROOT
from .personal_records import record_holders
from .repository import LedgerDatabase

# Only promotional boilerplate that takes the form of contact details or site patterns counts. Words like "微信" (WeChat) and "成人游戏" (adult games) appearing alone do not:
# Real feature titles contain them (a title like "还要微信跟老公汇报战果", "still has to WeChat her husband to report the results", is plot, not contact details).
PROMO_PHRASE = re.compile(
    r"(扫码|扫一扫|掃一掃|扫描|掃描|QR ?CODE|二维码|二維碼|加微信|加微|威信\d|微信号|"
    r"微信\s*[:：]|免费看|免费玩|福利群|最新地址|"
    r"永久(?:域名|地址|发布)|地址发布器|防屏蔽|资源获取|点击(?:观看|下载|进入)|下载APP|下载|签到|代币|领取|"
    r"强力推荐|国产大片|在线视频|線上影片每天火熱更新|手机看片|手機影城|"
    r"大饱眼福|房间火爆|澳门|赌场|博彩|棋牌|加我|"
    r"GAMES?\d*|APP)", re.I)
# Boilerplate that only lowers the residue and does not by itself count as a hit.
#
# Mobile-game interstitials bypassed the criteria above as a batch: `爱姬远征-免费18禁手游-扫码安装.jpg` hits "扫码 (QR scan)",
# but after stripping, "爱姬远征免费禁手游安装"12 characters remain, which fall in the middle tier of 6~14 and score only 30 points, below the
# 40 threshold; `三国志侵略版-免费18禁手游-扫码安装.png` with two more residue characters it reaches 14, and does not even get 30 points.
# The more residue, the lower the score, yet none of this residue contains a single content word - so the longer the ad name is written, the safer it actually is.
# Game names (爱姬远征, 天下布魔) can never enter the word list; all that can be stripped is the fixed boilerplate around them.
# These words appearing alone prove nothing (real titles contain "免费" (free) too), so they only take part in the residue calculation and are not a basis for a hit.
PROMO_FILLER = re.compile(
    r"(免费\d*禁|免费|免費|手游|手遊|成人遊?戲|成人游戏|下载安装|安装|安裝|访问|訪問)",
    re.I)
# Cannot end with \b: `uuc82.com_2` where `m` and `_` are both word characters and form no boundary, so the domain would be missed.
PROMO_DOMAIN = re.compile(
    r"(?:https?://)?(?:www\.)?[\w-]{2,}\.(?:com|net|me|la|xyz|cc|tv|top|vip|club|"
    r"info|org|pw|cn|app|site|online|shop)(?![a-z0-9])", re.I)
# Real codes carry a label prefix and a hyphen (ABW-153, 259LUXU-1141). RAIKUN325 ones like this without a hyphen
# are creator account names wrongly filled into code, and cannot be used for the "same code has a full version" comparison,
# The criterion shares its origin with `is_jav_code`; the separator is exactly the only clue that tells a code from an account name.
REAL_CODE = re.compile(r"^(?:\d{2,3})?[A-Za-z]{2,8}-\d{2,5}$|^FC2", re.I)
PART_MARK = re.compile(r"(CD\d|part\d|分卷|-\d{1,2}$|\(\d+\)$)", re.I)
# Two forms of promotional-site directories, sharing origin with `scripts/find_ads.py` criteria D/E:
# The creator slot is a projection of the old importer's directory name, `bbsxv.xyz-DOCP-324` ad packs like this land right there;
# Bare-domain directories (98T.la@account, huachishe.com@series) are repost watermarks, not ads, and must not enter the criterion.
AD_DOMAIN = re.compile(
    r"\b[0-9a-z][-0-9a-z]{1,20}\.(?:cc|xyz|xxx|com|net|la|me|top|vip|club|app|cn|pw|tv|gg)\b", re.I)
AD_DIRPACK = re.compile(
    r"[0-9a-z][-0-9a-z]{1,20}\.[a-z]{2,10}[ \-_]+\[?[A-Za-z]{2,6}-?\d{2,5}", re.I)
#: With this many assets in one directory, it is a bulk-downloaded resource pack, not an interstitial stuffed into someone else's directory.
#:
#: `jitumi.pw(77).gif` and `【91狼友之家91home.cc】19.jpg` leave only a domain after stripping, the hardest
#: "whole-name promo phrase" signal, yet they respectively lie in `森萝财团 X-019 肉丝换白丝 [103P1V-1.39GB]`
#: (107 items in the same directory) and `赠送-稀缺整合【91home.cc】\海角\新建文件夹` (24 items in the same directory):
#: Here the domain is a name the packaging channel gave the whole pack, and dozens or hundreds of images in a set are themselves resources to keep.
#: Ad interstitials are the opposite: one or two squeezed into someone else's code directory - WAAA-415 that directory has only 13 items.
BUNDLE_DIR_ASSETS = 20
#: With this many similar promotional names in one directory, they are interstitials stuffed in as a group.
#:
#: The exact mirror of `BUNDLE_DIR_ASSETS` resources are sets of main features and galleries, interstitials are groups of the same boilerplate.
#: `三国志侵略版-免费18禁手游-扫码安装.png` still has a 6-character game name left after stripping, which by name alone only reaches the
#: middle tier; but 10 other files in the same directory carry the identical promo tail, and none of them is part of a main feature.
PROMO_CLUSTER_FILES = 3
#: Fixed tails of thumbnails and covers relative to the main feature (`MIAD573_02.wmv` ↔ `MIAD573_02_s.jpg`,
#: `LXVS006-BD.iso` ↔ `lxvs006pl.jpg`). `pl`/`ps` are the common spellings for large and small JAV posters.
#: Digits are not stripped: if they were, `MIAD573_02_s` would fall back to `MIAD573`, which is no longer the same main feature.
SHOT_TAIL = re.compile(r"[-_. ]?(?:s|t|pl|ps|thumb|poster|cover|fanart|big|small)$", re.I)
#: Quality and carrier tails the main feature carries itself, stripped only when pairing, so a poster can match the original disc.
DISC_TAIL = re.compile(r"[-_. ]?(?:bd|bdmv|bdiso|bdrip|dvd|dvdiso|iso|uhd|fhd|hd)$", re.I)
#: A file over this size is content in itself; there is no need to look at the directory name.
#:
#: `javme.me_LXVS-006-BD\LXVS006-BD.iso` is a 19.8 GB Blu-ray disc image, yet it was scored 45 points because it lives in a
#: "domain+code" directory. Ads do not have large files: all the interstitials of a whole pack add up to less than 10 MB,
#: a file of several GB is a resource site renaming the directory for its own resources, not promotion stuffed in by the resource site.
CONTENT_BYTES = 1024 ** 3
INTERNET_SHORTCUT_SUFFIXES = frozenset({".url"})
#: Saved web pages. `.mhtml` is an Edge full-page archive, and the one in a media directory has no content value;
#: It, like `.url` is a "landing page" rather than media, and leaves no chance for the size fallback.
PAGE_ARCHIVE_SUFFIXES = frozenset({".mhtml", ".mht", ".htm", ".html"})
#: Promo brand words. Appearing alone in a video name they are not evidence - `麻豆传媒`, `外围`, `直播` can all be
#: part of a real title - they score only when combined with a promo pattern, decorative symbols or a promo directory context.
#: The list comes from the 2026-09 user instance `B:\xxr\0208 (23)` self-identified promo sites and promo APP.
AD_BRAND = re.compile(
    r"(91(?:短视频|视频|国产|AV|約炮|约炮)|成人抖音|快手直播|杏吧|草榴|色中色|成人头条|"
    r"泡芙短视频|含羞草|她趣|台湾UU|全国外围|外围楼凤|楼凤|麻豆传媒映画|蜜桃影像|"
    r"成人游戏|169BBS|SEX169)", re.I)
#: Pattern words that count as a promo name only when co-occurring with a brand word. `视频`, `直播` overly common words like these are not in this table:
#: `麻豆传媒映画APP-限时免费体验` is a promo pack, `麻豆传媒 某作品` is a resource.
AD_BRAND_FORM = re.compile(
    r"(APP|一键|导航|聊天室|免费体验|限时免费|扫码|资源获取|网址|发布页)", re.I)
#: Size cap for brand promo images. `蜜桃影像传媒.png` 18 KB, `東方秋白…169BBS…` 75 KB,
#: while any content image is in the MB range; a brand name plus this size is an ad card, not a gallery of the work.
BRAND_TINY_BYTES = 300 * 1024
#: Decorative-symbol names (`❤91短视频❤.jpg`): small images with hearts on both sides or several hearts, with no substantive description in the name.
DECOR_MARKS = "❤♥❥♡💕💗💖💘💝"
#: Size cap for decorative images. `❤草榴视频❤.jpg` 705 KB is an ad card; a same-named companion cover (2 MB class) does not count,
#: It uses the `has_sibling_original` main-feature pairing exemption.
DECORATED_MAX_BYTES = 1536 * 1024
#: Forms where a directory name reveals a promo pack: `-APP`, `一键约炮`, `論壇文宣`, chat rooms and so on.
#: Matches only directory components, not file names; after a hit, the files in the directory that do not constitute content all go to review.
AD_DIR_FORM = re.compile(
    r"(論壇文宣|论坛文宣|文宣|宣傳|一键约炮|全国外围|外围楼凤|楼凤|聊天室|"
    r"免费体验|限时免费)", re.I)
#: `APP` is matched as a word: `Happy` also hides `app`, a bare substring would pull in normal directories;
#: `.app` is a domain suffix, `bkm9.app` promo directories like that rely on other evidence in the directory, not on this one.
AD_DIR_APP = re.compile(r"(?:^|[^A-Za-z.])APP(?:[^A-Za-z.]|$)", re.I)
#: A brand name counts as a promo directory only when the directory also carries a media platform word; `草榴视频` is a promo APP,
#: `麻豆传媒` appearing alone may be a resource directory of this label.
AD_DIR_BRAND_MEDIA = re.compile(r"(?:视频|視頻|影视|影視|传媒|傳媒|直播|短视频|短視頻)", re.I)
JUNK_KINDS = frozenset({"video", "image", "audio", "archive", "url", "other"})
#: Videos reaching this size are no longer treated as ad residue. This value shares its source with the original "under 120 MB"evidence;
#: A larger short version of the same code is a duplicate-cleanup issue, taken over by ``q_duplicates``.
JUNK_VIDEO_MAX_BYTES = 120 * 1024**2
MEDIA_SIDECAR_SUFFIXES = frozenset({".nfo", ".srt", ".ass", ".ssa", ".vtt", ".sub", ".idx"})
INSTALLER_SUFFIXES = frozenset({".apk", ".exe", ".msi"})
#: Promo attachments identified by fixed naming. Name and size can only say "looks like"; the content counts only once a person has looked at it.
PROMO_NAMES_FILE = PROJECT_ROOT / "resources" / "junk" / "promo_attachment_names.json"
#: Score threshold for entering the junk review queue.
JUNK_REVIEW_SCORE = 40
#: `scripts/trash_junk.py --apply` default score threshold for automatically moving to the recycle bin. Evidence that can only be reviewed
#: (directory and size evidence of fixed-name videos with unprobed duration) alone cannot reach this tier.
AUTO_TRASH_SCORE = 60
#: Structural evidence for very short attachments only enters review: the directory must contain a long main feature of the same name, and the attachment must be short and small enough relative to it.
SHORT_ATTACHMENT_SECONDS = 30
SHORT_ATTACHMENT_BYTES = 32 * 1024**2
SHORT_ATTACHMENT_CLUSTER = 3
#: "source site name + number" is also used by normal short clips; a site watermark cannot be a basis for automatic quarantine.
NUMBERED_SOURCE_VIDEO = re.compile(r"^(?:\[[^\]]+\]|【[^】]+】)[\s._-]*\d+(?:[\s._-]*\(\d+\))?$")
PAGE_COMPONENT_SUFFIXES = frozenset({".js", ".css", ".aspx"})
PAGE_CHROME_IMAGE = re.compile(r"^(?:banner(?:_[bs])?|1000x90(?:yunding)?|count\d*|logo|lan\d*|you|zuo|zuoxia)$", re.I)
PAGE_PROMO_CLAIM = re.compile(r"(?:记住|記住).{0,12}(?:网址|網址)|(?:网址|網址).{0,8}(?:发布|發布)")


def promo_residue(name: str) -> int:
    """How many substantive descriptive characters remain after stripping domains and promo boilerplate.

    This is the key to telling an "ad" from a "main feature with a site watermark":
    `点击观看 房间火爆` nothing is left after stripping;
    `236953.xyz 推特新晋4年绿帽美腿淫妻网黄「一个ren」…` a large body of content description still remains after stripping.

    Stripped words are replaced with an empty string rather than a space: the space is itself in the counted character set, so replacing with a space amounts to adding back a residue character for every stripped
    word. `爱姬远征-免费18禁手游-扫码安装` only four characters remain after stripping four boilerplate segments,
    but because the four added spaces were counted it came to 8, landing just outside the threshold - the cleaner the stripping, the higher the residue.
    """
    text = PROMO_DOMAIN.sub("", name or "")
    text = PROMO_PHRASE.sub("", text)
    text = PROMO_FILLER.sub("", text)
    # Count only CJK characters and letters, ignoring numbers, extensions and punctuation.
    return len(re.findall(r"[一-鿿぀-ヿ가-힯 A-Za-z]", text))


def _folder_index(connection, *, roots=None) -> tuple[dict[str, int], dict[str, set[str]]]:
    """How many assets each directory holds, and the file-name stems of the main features in it.

    Both criteria need to look at the candidate's neighbors and not only the candidate itself: a resource pack is judged by directory size, and covers and screenshots by
    whether the same directory has a main feature of the same name. `rsplit` rather than `PureWindowsPath`: ledger paths are all in
    Windows form, and here the whole table of over seventy thousand rows is walked, so taking only the directory name is not worth building a path object per row.

    The main feature is not limited to `medium='video'`: Blu-ray disc images in the ledger are `other`, which is likewise the copy of the
    content a poster must match. Size is used to catch this class rather than guessing extensions - `.iso`, `.mds`, `BDMV` what else exists beyond,
    is only known with the next disc image in the library.
    """
    counts: dict[str, int] = {}
    videos: dict[str, set[str]] = {}
    scope, parameters = _scope_clause(roots=roots)
    for path, medium, size in connection.execute(
            "SELECT path,medium,size FROM asset WHERE path IS NOT NULL AND path<>''" + scope, parameters):
        folder, _, filename = str(path).rpartition("\\")
        counts[folder] = counts.get(folder, 0) + 1
        if medium == "video" or (size or 0) >= CONTENT_BYTES:
            stem = filename.rsplit(".", 1)[0] if "." in filename else filename
            key = stem.casefold()
            videos.setdefault(folder, set()).add(key)
            trimmed = DISC_TAIL.sub("", key)
            if trimmed:
                videos[folder].add(trimmed)
    return counts, videos


def has_sibling_original(stem: str, sibling_videos: set[str]) -> bool:
    """True means the same directory has a main feature of the same name, and this is that main feature's cover or screenshot."""
    key = str(stem or "").casefold()
    if not key:
        return False
    return key in sibling_videos or SHOT_TAIL.sub("", key) in sibling_videos


def is_decorated_name(stem: str) -> bool:
    """A name carrying two or more decorative symbols with no substantive description.

    The sample is the batch in `B:\\xxr\\0208 (23)` 7~20 KB files of `❤91短视频❤.png`.
    A single heart does not count: Telegram exports and normal titles often have a single heart; only two or more is decorative naming.
    """
    return sum(str(stem or "").count(mark) for mark in DECOR_MARKS) >= 2


def _promo_directory(parts) -> bool:
    """Any directory level in the path reveals itself as a promo pack.

    Three forms: `APP` word shape (`_含羞草APP`), promo directory names (`一键约炮`, `論壇文宣`),
    Brand name plus media word (`_草榴视频`). Only directory components are examined; whether the file name is itself promo is judged by the caller.
    """
    for part in parts:
        text = str(part)
        if AD_DIR_APP.search(text) or AD_DIR_FORM.search(text):
            return True
        if AD_BRAND.search(text) and AD_DIR_BRAND_MEDIA.search(text):
            return True
    return False


def _scope_clause(*, asset_ids=None, roots=None):
    """An explicitly empty scope matches only the empty set; directory comparison includes source and separator boundaries."""
    if asset_ids is not None:
        ids = tuple(dict.fromkeys(int(value) for value in asset_ids))
        return " AND id IN (SELECT value FROM json_each(?))", (json.dumps(ids),)
    if roots is None:
        return "", ()
    clauses, values = [], []
    for location, root in roots:
        root = str(PureWindowsPath(root)).rstrip("\\")
        prefix = root + "\\"
        clauses.append("(location=? AND (path=? COLLATE NOCASE OR substr(path,1,?)=? COLLATE NOCASE))")
        values.extend((location, root, len(prefix), prefix))
    return (" AND (" + " OR ".join(clauses) + ")", tuple(values)) if clauses else (" AND 0", ())


def _junk_rows(connection, *, asset_ids=None, roots=None):
    """Read the physical files eligible for junk review; subtitles, NFO and large videos are excluded at the outermost layer."""
    marks = ",".join("?" for _ in SCANNABLE_LOCATIONS)
    scope, parameters = _scope_clause(asset_ids=asset_ids, roots=roots)
    rows = connection.execute(
        "SELECT id,location,name,medium,creator,code,size,duration,width,height,snapshot_path,"
        "feedback,disposal,play_count,leave_ratio,o_count,studio,ctx_orient,path "
        f"FROM asset WHERE location IN ({marks}) AND disposal IS NULL "
        "AND (COALESCE(medium,'other')<>'video' OR (size < ? "
        "AND (duration IS NULL OR duration <= 1200)))" + scope,
        (*SCANNABLE_LOCATIONS, JUNK_VIDEO_MAX_BYTES, *parameters)).fetchall()
    # NFO is a media-metadata sidecar, not physical content awaiting cleanup; even if its name or directory carries promo words,
    # parsing problems should be reported by metadata reading, and it must not enter the junk queue that moves files to the recycle bin.
    return [row for row in rows if _junk_file_eligible(row)]


def _junk_file_eligible(row) -> bool:
    """Metadata sidecars, STRM pointers, and volumes whose file itself carries a code are not junk attachments."""
    item = PureWindowsPath(row["name"] or row["path"] or "")
    # STRM size and name describe the link file and cannot serve as junk evidence for a remote movie.
    if item.suffix.casefold() in MEDIA_SIDECAR_SUFFIXES or item.suffix.casefold() == '.strm':
        return False
    identity = PART_MARK.sub("", PROMO_DOMAIN.sub("", item.stem)).strip("@._- ")
    return not (row["medium"] == "video" and PART_MARK.search(item.stem)
                and release_code_from_filename(identity))


def _promo_neighbour_counts(rows) -> dict[str, int]:
    """Count promo names lacking content description in the same directory."""
    counts: dict[str, int] = {}
    for row in rows:
        name = row["name"] or PureWindowsPath(row["path"] or "").name
        stem = PureWindowsPath(name).stem
        if not (PROMO_PHRASE.search(stem) or PROMO_DOMAIN.search(stem)):
            continue
        if promo_residue(stem) >= 14:
            continue
        folder = str(row["path"] or name).rpartition("\\")[0]
        counts[folder] = counts.get(folder, 0) + 1
    return counts


@cache
def promo_name_rules() -> tuple[dict, ...]:
    """Read the rules from `PROMO_NAMES_FILE` for naming promo attachments; a missing file or wrong format raises an error directly."""
    data = json.loads(PROMO_NAMES_FILE.read_text(encoding="utf-8"))
    rules = []
    for entry in data["rules"]:
        names = frozenset(re.sub(r"\s", "", name).casefold() for name in entry.get("names", ()))
        patterns = tuple(re.compile(pattern, re.I) for pattern in entry.get("patterns", ()))
        if not entry["reason"] or not (names or patterns) or int(entry["max_bytes"]) <= 0:
            raise ValueError(f"Promo-attachment naming rule is incomplete: {entry}")
        rules.append({
            "reason": str(entry["reason"]),
            "suffixes": frozenset(str(suffix).casefold() for suffix in entry["suffixes"]),
            "max_bytes": int(entry["max_bytes"]),
            "parent_is_name": bool(entry.get("parent_is_name")),
            "names": names,
            "patterns": patterns,
        })
    return tuple(rules)


def _promo_name_reason(suffix: str, path: str, size: int) -> str:
    """Reason for matching a promo-attachment fixed name in the word list; enough only for the review queue, see `AUTO_TRASH_SCORE`."""
    item = PureWindowsPath(path)
    stem = item.stem
    for rule in promo_name_rules():
        if suffix not in rule["suffixes"] or not 0 < size <= rule["max_bytes"]:
            continue
        if rule["parent_is_name"] and item.parent.name != stem:
            continue
        if (re.sub(r"\s", "", stem).casefold() in rule["names"]
                or any(pattern.fullmatch(stem) for pattern in rule["patterns"])):
            return rule["reason"]
    return ""


def _attachment_junk_reason(suffix: str, path: str, size: int) -> str:
    """Distinguish installer attachments from web-archive components."""
    if suffix in INSTALLER_SUFFIXES and size < 64 * 1024**2:
        return "Installer attachment in a media directory"
    if suffix in PAGE_COMPONENT_SUFFIXES and any(
            part.casefold().endswith("_files") for part in PureWindowsPath(path).parent.parts):
        return "Script or style attachment of a web archive"
    parent = PureWindowsPath(path).parent.name
    if (parent.casefold().endswith('_files') and PAGE_PROMO_CLAIM.search(parent)
            and AD_DOMAIN.search(parent[:-len('_files')]) and suffix in {'.gif', '.jpg', '.png'}
            and size < 2 * 1024**2
            and (PAGE_CHROME_IMAGE.fullmatch(PureWindowsPath(path).stem)
                 or (PureWindowsPath(path).name.casefold() == '1.gif' and size <= 4096))):
        return "Banner, logo or navigation image of a promo web archive"
    return ""


def _short_attachment(row) -> bool:
    """A very short video with a measured value and no work identity or volume marker of its own."""
    stem = PureWindowsPath(row["name"] or row["path"] or "").stem
    owner = row["creator"] or ""
    return (row["medium"] == "video"
            and 0 < (row["duration"] or 0) <= SHORT_ATTACHMENT_SECONDS
            and 0 < (row["size"] or 0) <= SHORT_ATTACHMENT_BYTES
            and not (owner and not AD_DOMAIN.search(owner))
            and not PART_MARK.search(stem)
            and not release_code_from_filename(stem))


def _release_main_videos(connection, *, roots=None) -> dict[str, list[tuple[float, int]]]:
    """Build, from active physical files, an index of long main features per release directory; an ordinary mixed directory does not count as a release directory."""
    mains: dict[str, list[tuple[float, int]]] = {}
    marks = ",".join("?" for _ in SCANNABLE_LOCATIONS)
    scope, parameters = _scope_clause(roots=roots)
    for path, duration, size in connection.execute(
            "SELECT path,duration,size FROM asset WHERE disposal IS NULL AND medium='video' "
            f"AND location IN ({marks}) AND duration>=1200 AND size>=? AND path IS NOT NULL" + scope,
            (*SCANNABLE_LOCATIONS, JUNK_VIDEO_MAX_BYTES, *parameters)):
        item = PureWindowsPath(path)
        key = promo_free_key(item.stem)
        if key and key == promo_free_key(item.parent.name):
            mains.setdefault(str(item.parent).casefold(), []).append((duration, size))
    return mains


def _short_attachment_reasons(connection, rows, *, roots=None) -> dict[int, str]:
    """Generate review evidence from the size relationship between main features and attachments, grouping within a directory and spread across release directories.

    Does not read media, and does not hit by theme, game name or promo words. Identical measurements are only a spread clue and cannot prove identical content.
    """
    mains = _release_main_videos(connection, roots=roots)
    folders: dict[str, set[str]] = {}
    signatures: dict[tuple, set[str]] = {}
    candidates = []
    for row in rows:
        if not _short_attachment(row):
            continue
        path = PureWindowsPath(row["path"] or "")
        folder = str(path.parent).casefold()
        if not any(duration >= row["duration"] * 40 and size >= row["size"] * 10
                   for duration, size in mains.get(folder, ())):
            continue
        signature = (row["size"], round(row["duration"], 3), row["width"], row["height"])
        folders.setdefault(folder, set()).add(str(path).casefold())
        if (row["width"] or 0) > 0 and (row["height"] or 0) > 0:
            signatures.setdefault(signature, set()).add(folder)
        candidates.append((row["id"], folder, signature))
    reasons = {}
    for asset_id, folder, signature in candidates:
        count = len(folders[folder])
        spread = len(signatures.get(signature, ()))
        if count >= SHORT_ATTACHMENT_CLUSTER:
            reasons[asset_id] = f"Next to a long main feature in the same directory there are {count} very short, small attachments; verify the content"
        elif spread >= SHORT_ATTACHMENT_CLUSTER:
            reasons[asset_id] = f"Very short attachments with the same size, duration and resolution are spread across {spread} release directories; verify the content"
    return reasons


def _video_evidence(row, stem: str, longer: dict, promo_dir: bool,
                    directory_points: int, attachment_reason: str = "") -> tuple[int, int, list[str]]:
    """The video's own evidence: full version of the same code, duration, size and promo directory.

    Returns (score, the part of the score that is only enough for review, reasons). A video whose duration was not probed may well be the main feature:
    Promo creator slot or "domain+code" directory (`directory_points`), a promo directory and size only say where it lives,
    and how big it is, which cannot show it is an ad; these scores are only enough for the review queue.
    """
    score, why = 0, []
    code = (row["code"] or "").strip()
    duration = row["duration"]
    longest = longer.get(code)
    if longest and REAL_CODE.match(code) and duration is not None and 0 < duration < longest * 0.2 \
            and not PART_MARK.search(stem):
        # Volumes are already excluded; under a real code, less than 20% of the duration is basically a clip/trailer, and that alone is enough to queue it for review.
        # User-flagged `反抗不如享受.mp4` (ABW-220, 244 seconds) falls just outside the old 35-point cutoff.
        score += 40; why.append(f"The same code has a {longest/60:.0f} minute full version")
    if duration is not None and 0 < duration < 240:
        score += 15; why.append("Under 4 minutes")
    context = directory_points
    if (row["size"] or 0) < JUNK_VIDEO_MAX_BYTES:
        score += 10; context += 10; why.append("Under 120 MB")
    if promo_dir:
        # 30 points alone are no reason to delete a film: a main feature may also be lying in a wrongly named directory of someone else's,
        # one more piece of duration or size evidence is needed to reach the threshold.
        score += 30; context += 30; why.append("Lives in a promo directory")
    probed = duration is not None and duration > 0
    review_only = 0 if probed else context
    if NUMBERED_SOURCE_VIDEO.fullmatch(stem) and PROMO_DOMAIN.search(stem):
        review_only += AUTO_TRASH_SCORE
        why.append("A numbered video may carry only a source watermark; verify the content")
    if attachment_reason:
        score += JUNK_REVIEW_SCORE; review_only += JUNK_REVIEW_SCORE; why.append(attachment_reason)
    return score, review_only, why


def _judgement_inputs(database, *, asset_ids, roots):
    """Read candidates, user decisions, work versions and directory context from the same ledger snapshot."""
    with database.read_connection() as c:
        rows = _junk_rows(c, asset_ids=asset_ids, roots=roots)
        if not rows:
            return [], {}, frozenset(), {}, {}, {}
        # Whether the same code has a clearly longer version; meaningful only when the code is a real code.
        longer = {r[0]: r[1] for r in c.execute(
            "SELECT code, max(duration) FROM asset WHERE medium='video' AND code IS NOT NULL "
            "AND code<>'' AND duration IS NOT NULL GROUP BY code")}
        dismissed_keys = [str(row[0]) for row in c.execute(
            "SELECT item_key FROM review_decision "
            "WHERE category='junk_file' AND status='rejected'"
        )]
        dismissed_ids = {int(key) for key in dismissed_keys if key.isdigit()}
        # Explicit assets can span the whole library; neighbors are read in one go to avoid stitching thousands of directories into an SQL OR expression.
        context = None if asset_ids is not None else roots
        folder_assets, folder_videos = _folder_index(c, roots=context)
        context_rows = _junk_rows(c, roots=context) if asset_ids is not None else rows
        short_attachments = _short_attachment_reasons(c, context_rows, roots=context)
    return rows, longer, frozenset(dismissed_ids), folder_assets, folder_videos, short_attachments


def scored_candidates(database, *, asset_ids=None, roots=None) -> tuple[list[dict], frozenset[int]]:
    """Candidates sorted by suspicion score from high to low, together with the user-confirmed non-junk id."""
    rows, longer, dismissed_ids, folder_assets, folder_videos, short_attachments = _judgement_inputs(
        database, asset_ids=asset_ids, roots=roots)
    # How many candidates in each directory carry promo names; the interstitial criterion looks at whether it has accomplices.
    promo_neighbours = _promo_neighbour_counts(rows)
    out = []
    for r in rows:
        d = dict(r)
        s, why = 0, []
        name = d.get("name") or PureWindowsPath(d.get("path") or "").name
        name_path = PureWindowsPath(name)
        nm = name_path.stem
        suffix = name_path.suffix.casefold()
        d["junk_kind"] = (
            "url" if suffix in INTERNET_SHORTCUT_SUFFIXES
            else (d.get("medium") if d.get("medium") in JUNK_KINDS else "other")
        )
        residue = promo_residue(nm)
        promo = bool(PROMO_PHRASE.search(nm) or PROMO_DOMAIN.search(nm))
        page_archive = suffix in PAGE_ARCHIVE_SUFFIXES
        if suffix in INTERNET_SHORTCUT_SUFFIXES:
            s += 60; why.append("URL shortcut")
        elif page_archive:
            s += 60; why.append("Web archive")
        attachment_reason = _attachment_junk_reason(suffix, d.get("path") or name, d.get("size") or 0)
        if attachment_reason:
            s += 60; why.append(attachment_reason)
        # Scores that are only enough for the review queue: fixed names, and directory and size evidence for videos with unprobed duration.
        review_only = 0
        name_reason = _promo_name_reason(suffix, d.get("path") or name, d.get("size") or 0)
        if name_reason:
            s += JUNK_REVIEW_SCORE; review_only += JUNK_REVIEW_SCORE; why.append(name_reason)
        # Directory-dimension evidence: ad pack file names are often clean (`极道世界.mp4`), the only clue lies in the creator slot or the path that the old importer
        # projected from the directory name. creator slot itself is a promo-site domain, it is no longer
        # "has an owner so it is a main feature" evidence; both places below that trust creator must rule out this case first.
        owner = d.get("creator") or ""
        owner_is_promo = bool(AD_DOMAIN.search(owner))
        real_owner = bool(owner) and not owner_is_promo
        # ledger paths are in Windows form on both platforms. `rpartition` has no platform dependence,
        # Keys also share exactly the same origin as `_folder_index`; `os.path.dirname` on macOS would treat the whole
        # backslash path as a file name.
        folder = str(d.get("path") or name).rpartition("\\")[0]
        # In a bulk-downloaded resource pack, the domain is a name the packaging channel gave the whole pack, not an interstitial exposing itself.
        bundled = folder_assets.get(folder, 0) >= BUNDLE_DIR_ASSETS
        # A directory name carrying a promo-site domain only says "which site it was downloaded from" and cannot show that this file is an ad.
        # When the file itself is a real code, itself has content-level size, or is the cover/screenshot of a main feature in the same directory,
        # the directory evidence does not hold.
        #
        # Only non-videos are placed here: the video in an ad pack is itself named `极道世界.mp4`, its code is the real-code shape that the old importer projected from
        # `bbsxv.xyz-DOCP-324` directory name, and it is itself in the main-feature
        # list - both exemptions would automatically hold for videos, `AD_DIRPACK` this criterion would be gone.
        self_evident = d.get("medium") != "video" and (
            is_jav_code(d.get("code"))
            or (d.get("size") or 0) >= CONTENT_BYTES
            or has_sibling_original(nm, folder_videos.get(folder, frozenset()))
        )
        decorated = (d.get("medium") != "video" and is_decorated_name(nm)
                     and (d.get("size") or 0) <= DECORATED_MAX_BYTES)
        brand_hit = bool(AD_BRAND.search(nm)) and bool(
            AD_BRAND_FORM.search(nm)
            or (d.get("medium") == "image"
                and (d.get("size") or 0) <= BRAND_TINY_BYTES))
        promo_dir = _promo_directory(PureWindowsPath(d.get("path") or name).parent.parts)
        if promo and residue < 6 and not bundled:
            # Once stripped, the name is only the ad itself; this is the hardest signal.
            s += 60; why.append("The whole name is promo text")
        elif promo and residue < 14 and not real_owner and not bundled:
            s += 30; why.append("Promo text makes up the bulk of the name")
            neighbours = promo_neighbours.get(folder, 0)
            if neighbours >= PROMO_CLUSTER_FILES:
                s += 30
                why.append(f"The same directory has another {neighbours - 1} similar promo names")
        directory_points = 0
        if owner_is_promo:
            directory_points = 50; why.append("Creator slot is a promo-site domain")
        elif AD_DIRPACK.search(folder) and not self_evident:
            directory_points = 45; why.append('Directory is a "domain+code" promo pack')
        s += directory_points
        # Promo forms of non-videos: small decorative-symbol images, brand promo names, living in a promo directory. `self_evident`
        # (real code, content-level size, main-feature companion image) and web archives and URL shortcuts are already scored separately,
        # not stacked again here.
        if (d.get("medium") != "video" and not self_evident and not page_archive
                and suffix not in INTERNET_SHORTCUT_SUFFIXES):
            if decorated:
                s += 60; why.append("Small decorative-symbol image")
            elif brand_hit:
                s += 60; why.append("Promo brand name")
            elif promo_dir:
                s += 50; why.append("Lives in a promo directory")
        if d.get("medium") == "video":
            points, weak, reasons = _video_evidence(
                d, nm, longer, promo_dir, directory_points, short_attachments.get(d["id"], ""))
            s += points; review_only += weak; why.extend(reasons)
        # One with a real creator attribution whose name still has substantive description after stripping is a watermarked main feature, not an ad.
        if real_owner and residue >= 14 and not (attachment_reason or name_reason):
            s -= 45
        if review_only and s - review_only < AUTO_TRASH_SCORE:
            s = min(s, AUTO_TRASH_SCORE - 1)
        if s >= JUNK_REVIEW_SCORE:
            d["score"] = s; d["why"] = " · ".join(why)
            out.append(d)
    out.sort(key=lambda x: (-x["score"], -(x["size"] or 0)))
    return out, frozenset(dismissed_ids)


def isolate(database, *, asset_ids=None, roots=None, protected_ids=()) -> dict:
    """Move high-scoring junk within an explicit scope into the restorable recycle bin, without reading or deleting media.

    Main features that were manually kept, have personal records, carry a work identity in the file itself or are named by the caller are protected. The scoring basis is re-checked before writing,
    If a scan or manual action changed the asset during the computation, it is left for the next decision.
    """
    if asset_ids is None and roots is None:
        raise ValueError("Automatic junk check must specify assets or a source directory")
    if not isinstance(database, LedgerDatabase):
        database = LedgerDatabase(database)
    scored, dismissed = scored_candidates(database, asset_ids=asset_ids, roots=roots)
    protected = set(protected_ids) | set(dismissed)
    chosen = [row for row in scored if row['score'] >= AUTO_TRASH_SCORE and row['id'] not in protected]
    isolated = []
    if not chosen:
        return {'candidates': len(scored), 'review': sum(row['id'] not in dismissed for row in scored),
                'isolated': 0, 'ids': []}
    with database.write_transaction() as connection:
        connection.execute('BEGIN IMMEDIATE')
        holders = record_holders(connection, [row['id'] for row in chosen])
        for row in chosen:
            current = connection.execute("SELECT * FROM asset WHERE id=?", (row['id'],)).fetchone()
            if not _can_isolate(connection, current, row, holders):
                continue
            connection.execute(
                "UPDATE asset SET disposal='trash',disposal_reason='junk',feedback_at=? WHERE id=? AND disposal IS NULL",
                (time.time(), row['id']))
            isolated.append(row['id'])
    return {'candidates': len(scored), 'review': sum(row['id'] not in dismissed for row in scored
                                                   if row['id'] not in isolated),
            'isolated': len(isolated), 'ids': isolated}


def _can_isolate(connection, current, evidence, holders) -> bool:
    """The current asset still matches the computed evidence and has no user keep intent or work identity of its own."""
    if current is None or current['disposal'] is not None or current['id'] in holders:
        return False
    if current['feedback'] == 'like' or any(current[key] != evidence[key] for key in
            ('location', 'path', 'name', 'size', 'duration', 'creator', 'code', 'medium')):
        return False
    if connection.execute("SELECT 1 FROM review_decision WHERE category='junk_file' AND status='rejected' "
                          "AND item_key=?", (str(current['id']),)).fetchone():
        return False
    if connection.execute("SELECT 1 FROM asset_subtitle WHERE asset_id=?", (current['id'],)).fetchone():
        return False
    if current['medium'] == 'video' and (current['duration'] is None or current['duration'] <= 0):
        return False
    stem = PureWindowsPath(current['name'] or current['path'] or '').stem
    identity = PART_MARK.sub('', PROMO_DOMAIN.sub('', stem)).strip('@._- ')
    return not (current['medium'] == 'video' and release_code_from_filename(identity))


