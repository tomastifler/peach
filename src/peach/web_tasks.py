"""任务中心的读取端点：活动页要的那一份，一次请求拿全。

页面一屏上要同时回答三件事——谁在跑、刚才跑完的怎么样、有哪一轮被挡掉了。分成三个
端点意味着三次轮询、三份各自可能过期的快照，还得在前端再拼一次时间线。所以
`/api/tasks` 不带筛选时直接把这三段一起下发；带 `status`／`task_key` 时才退回成一张
普通的筛选列表，留给排查用。

「最近完成」按结束时刻从新到旧排，一页数的是顶层那几轮，后继随父任务一起下发；
`finished_has_more` 说它后面还有没有更早的。往前翻
带上当前最旧那一行的 `before_finished_at` 与 `before_id`，只回 `finished` 与
`finished_has_more` 这一页：在跑那段和被挡下那段由轮询那一份负责，翻页时再下发一遍
只会让两份快照互相打架。
"""
from __future__ import annotations

import sqlite3
from datetime import datetime

from .task_runs import ACTIVE_STATUSES, TERMINAL_STATUSES
from .task_results import RESULT_FIELDS, result_counts
from .web_result_versions import result_versions

#: 不带筛选时「最近完成」那一段每页的默认条数。一屏看得完，更早的往前翻。
RECENT_LIMIT = 20

#: 账本还没跑到 0028 时页面上显示这一句。迁移是单独一步，升级后第一次打开活动页
#: 撞上没有这张表是正常路径，不该是一个 500。
NO_TABLE = "The database is missing the task record table; check your backup per the runbook, then run peach migrate upgrade --yes"


def q_tasks(contract, args):
    try:
        return _tasks(contract, args)
    except sqlite3.OperationalError:
        # 只可能是这张表还不存在——这个函数别的地方不碰库。
        return {"ok": True, "filtered": False, "available": False,
                "message": NO_TABLE, "running": [], "skipped": [], "finished": [],
                "finished_has_more": False,
                "statuses": {"active": list(ACTIVE_STATUSES),
                             "finished": list(TERMINAL_STATUSES)}}


def _tasks(contract, args):
    payload = _payload_reader(contract)
    status = str((args or {}).get("status") or "").strip()
    task_key = str((args or {}).get("task_key") or "").strip()
    limit = _limit(args)
    before = _before(args)
    if before is not None and (status or task_key):
        raise ValueError("before_finished_at／before_id is only for the recently completed segment and cannot be combined with status or task_key")
    if status or task_key:
        rows = contract.task_runs.query(status=status, task_key=task_key, limit=limit)
        return {"ok": True, "filtered": True, "available": True,
                "runs": [payload(row) for row in rows]}
    finished, has_more = contract.task_runs.finished_page(before=before, limit=limit)
    if before is not None:
        return {"ok": True, "filtered": False, "available": True,
                "finished": [payload(row) for row in finished],
                "finished_has_more": has_more,
                "followup_counts": _parent_counts(contract, finished)}
    running = _active(contract, limit)
    # 还在跑的那一轮已经跑完的后继：它们挂在「正在进行」那张卡下面，不在哪一页里。
    finished += contract.task_runs.settled_followups(
        [row.id for row in running if not row.followup])
    # Parent tasks that have finished themselves while successors are still queued or running: they may be older than the "Recently completed" page, and if not sent separately,
    # its dispatched successors would find no parent card on the page and scatter one by one. It does not go into `finished`, so that the paging cursor does not skip the middle section.
    shown = {row.id for row in (*running, *finished)}
    working = [row for row in contract.task_runs.active_parents() if row.id not in shown]
    return {
        "ok": True,
        "filtered": False,
        "available": True,
        "result_versions": result_versions(contract),
        "running": [payload(row) for row in running],
        # 被挡掉的那些也在 `finished` 里（它们是 `cancelled`），这里单独再挑一份：
        # 「为什么没跑」是用户来这一页的主要问题，不该让他在完成列表里自己找。
        "skipped": [payload(row) for row in finished
                    if row.status == "cancelled" and "blocked_by" in row.result_summary],
        "finished": [payload(row) for row in finished],
        "finished_has_more": has_more,
        "working_parents": [payload(row) for row in working],
        "followup_counts": _parent_counts(contract, (*running, *finished, *working)),
        "statuses": {"active": list(ACTIVE_STATUSES), "finished": list(TERMINAL_STATUSES)},
    }


def _active(contract, limit: int) -> list:
    """The running one is never dropped, and for the queued ones the latest few are taken: when a round dispatches over a thousand successors, taking the latest by id would leave only the queued ones,
    and the one actually running would be squeezed out instead."""
    started = contract.task_runs.query(status="running", limit=500)
    queued = contract.task_runs.query(status="pending", limit=limit)
    return sorted({row.id: row for row in (*started, *queued)}.values(), key=lambda row: row.id, reverse=True)


def _parent_counts(contract, rows) -> dict[str, dict[str, int]]:
    """Successors are sent down only in part; how far the parent task has got and whether it still counts as in progress are answered by this count."""
    counts = contract.task_runs.followup_counts(row.id for row in rows if not row.followup)
    return {str(parent): states for parent, states in counts.items()}


def q_task(contract, run_id):
    payload = _payload_reader(contract)
    run = contract.task_runs.get(int(run_id))
    if run is None:
        # KeyError 在 API 层被翻成 404；ValueError 会变成 400，那是参数错，不是这里的事。
        raise KeyError(f"No run {run_id}")
    # 父子两头都给：从后继那一行点进来的人要知道它是哪一轮派出来的，从父任务点进来的
    # 要知道派出去的几条跑成什么样（ADR-0040）。父只给一层，链根在 `root_run_id` 上。
    parent = (contract.task_runs.get(run.parent_run_id)
              if run.parent_run_id else None)
    followups = [payload(child) for child in contract.task_runs.children(run.id)]
    return {"ok": True, "run": payload(run),
            "parent": payload(parent) if parent else None,
            "followups": followups,
            "followup_counts": _counts(followups)}


def _payload_reader(contract):
    """A completion checkpoint of the same round can supplement the summary, and reading does not write back to the task record."""
    from .job_recovery import read

    saved = {}

    def payload(row):
        result = row.payload()
        if row.task_key not in RESULT_FIELDS or row.status not in ('succeeded', 'failed'):
            return result
        if all(field in row.result_summary for field in RESULT_FIELDS[row.task_key]):
            return result
        if row.task_key not in saved:
            saved[row.task_key] = read(contract.task_runs.database.db_path, row.task_key)
        recovery = saved[row.task_key]
        if recovery.get('run_id') != row.id or recovery.get('status') not in ('complete', 'failed'):
            return result
        checkpoint = recovery.get('checkpoint')
        if not isinstance(checkpoint, dict):
            return result
        counts = result_counts(row.task_key, checkpoint)
        result['result_summary'] = {**counts, **result['result_summary']}
        return result

    return payload


def _counts(rows) -> dict:
    """后继按状态数一遍。折叠着的父任务据此标出有没有失败，不必展开整层。"""
    counts: dict[str, int] = {}
    for row in rows:
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return counts


def _before(args) -> tuple[str, int] | None:
    """往前翻的游标：两个参数成对出现，缺一个就是参数错，不悄悄退回第一页。"""
    moment = str((args or {}).get("before_finished_at") or "").strip()
    raw_id = str((args or {}).get("before_id") or "").strip()
    if not moment and not raw_id:
        return None
    if not moment or not raw_id:
        raise ValueError("before_finished_at and before_id must be provided together")
    # 只核对写法；比较仍用原文，与库里 `stamp()` 写下的文本逐字对齐。
    datetime.fromisoformat(moment.replace("Z", "+00:00"))
    run_id = int(raw_id)
    if run_id < 1:
        raise ValueError("before_id must be a positive integer")
    return moment, run_id


def _limit(args) -> int:
    raw = (args or {}).get("limit")
    if raw in (None, ""):
        return RECENT_LIMIT
    return max(1, min(int(raw), 500))
