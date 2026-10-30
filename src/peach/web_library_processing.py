"""统一处理任务的启动、只读状态查询与失败项重试。"""
import json
import hashlib

from . import settings_file
from .library_processing import (ALL_STAGES, COLLECT_STAGE, SCAN_STAGE, STAGES,
                                METADATA_STAGE, PREVIEWS_STAGE, _asset_selection,
                                decorate, issues_path, process_library, snapshot)
from .processing_control import control_for, initial_estimate, valid_mode, mode_ratio

ACTIVE = ('running', 'pausing', 'paused', 'stopping')

#: State fields returned to the page: `frontend/src/react/library-processing/library-processing.ts` 's
#: `LibraryProcessingData`, plus the matching Task Center row's `run_id`. The state file also holds these for resuming: `local_metadata` (with full media paths),
#: `asset_ids`, `completed_metadata` and other large fields, none of which the page reads; sent as is, each page polling every 10 seconds
#: would be over two megabytes and also hand media paths to the browser. Resuming and retrying read `_current()`, and do not pass through here.
PUBLIC_FIELDS = frozenset({
    'run_id', 'metadata_only', 'status', 'outcome', 'speed_mode', 'eta_seconds_min', 'eta_seconds_max', 'eta_kind',
    'eta_scope', 'eta_initial', 'job_id', 'stage', 'requested_stage', 'steps', 'checked', 'total',
    'scanned', 'scanned_bytes', 'identified', 'candidates', 'auto_applied', 'covers', 'previews',
    'performer_aliases', 'performer_avatars', 'performer_profile_conflicts',
    'performer_profile_failed', 'error', 'issue_count', 'paused_count', 'issue_preview',
    'issues_log', 'issues_truncated', 'retryable_asset_ids', 'notes', 'current_asset_id',
    'current_asset_name', 'current_action', 'current_started_at', 'last_progress_at', 'stalled',
    'waited_seconds', 'completed_at', 'current_source', 'skip_requested', 'archived', 'new_asset_count',
})


def public_state(state):
    """Page projection of task state: keeps only `PUBLIC_FIELDS`."""
    return {key: value for key, value in state.items() if key in PUBLIC_FIELDS}


def _current(contract):
    live = contract.library_processing_job.snapshot()
    thread = getattr(contract.library_processing_job, 'thread', None)
    if live and live.get('status') in ('cancelled', 'failed', 'complete') and thread is not None and thread.is_alive():
        return {**live, 'status':'stopping'}
    if live and live.get('status') in ACTIVE:
        return live
    stored = snapshot(settings_file.active())
    if live and live.get('job_id') == stored.get('job_id'):
        return {**stored, **live}
    if live and live.get('started_at', 0) > stored.get('started_at', 0):
        # A failure before grabbing the processing lock has not yet written the progress file, and the previous round's final state must not mask this error.
        return live
    return stored


def q_library_processing(contract, _args):
    if _args.get('estimate') == '1':
        config = settings_file.active()
        body = {'stage': _args.get('stage') or ALL_STAGES}
        if 'incremental' in _args:
            body['incremental'] = _args['incremental'] == '1'
        if 'scope' in _args:
            body['scope'] = _args['scope']
        if 'asset_ids' in _args:
            body['asset_ids'] = json.loads(_args['asset_ids'])
        _, asset_ids, stage = _processing_request(contract, config, {}, body)
        from .processing_inventory import preview
        return {'traffic': preview(config, contract.db_path, stage, asset_ids, _args.get('inventory'),
                                   incremental=body.get('incremental', False))}
    state = decorate(_current(contract))
    control = control_for(settings_file.active())
    control.refresh(force=True)
    state['speed_mode'] = control.mode
    state['skip_requested'] = (state.get('status') == 'running' and state.get('current_asset_id') is not None
                               and control.skip_asset_id == state.get('current_asset_id'))
    from .media_processing_policy import metadata_only
    state['metadata_only'] = metadata_only(settings_file.active().directory('state'))
    from .job_recovery import read
    recovery = read(contract.db_path, 'library-processing')
    if control.job_id == state.get('job_id') and control.cancelled and state.get('status') in ACTIVE:
        state.update(status='stopping', eta_seconds_min=None, eta_seconds_max=None)
    if recovery.get('status') == 'cancelled' and recovery.get('job_id') == state.get('job_id'):
        state.update(status='cancelled', outcome='cancelled', error='')
    state['retryable_asset_ids'] = _remaining_retry_ids(contract, state)
    from .library_new_assets import pending
    state['new_asset_count'] = len(pending(contract.db_path))
    if state.get('status') not in ACTIVE and recovery.get('status') == 'blocked':
        state.update(status='failed', outcome='interrupted', error=f"The task could not be recovered automatically: {recovery.get('error') or 'Please start the task again'}")
    # 上一趟任务的状态文件里没有这个字段，而它那份完整清单还在磁盘上：按 job_id
    # 推出地址补回去，界面才有得可给。
    if state.get('issue_count') and state.get('job_id') and not state.get('issues_log'):
        path = issues_path(settings_file.active(), str(state['job_id']))
        if path.is_file():
            state['issues_log'] = str(path)
    return public_state(state)


def _request_skip(control, previous, body):
    asset_id = body.get('asset_id')
    if (isinstance(asset_id, bool) or not isinstance(asset_id, int)
            or previous.get('status') != 'running'
            or previous.get('current_asset_id') != asset_id
            or previous.get('current_action') not in ('querying_metadata', 'fetching_cover')):
        raise ValueError('The current movie has changed or is not collecting external metadata; please refresh and retry')
    control.skip_current(str(body['job_id']), asset_id)


def _archive_notice(contract, config, body):
    previous = _current(contract)
    if not body.get('job_id') or body['job_id'] != previous.get('job_id'):
        raise ValueError('The task has changed; please refresh the page and retry')
    if previous.get('status') in ACTIVE:
        raise ValueError('The notice can be archived only after the task ends')
    from .library_processing import _save, state_path
    saved = json.loads(state_path(config).read_text(encoding='utf-8'))
    if saved.get('job_id') != body['job_id']:
        raise ValueError('The task has changed; please refresh the page and retry')
    _save(state_path(config), {**saved, 'archived':True})
    return q_library_processing(contract, {})


def _cancel_processing(contract, config, control, previous, job_id):
    control.request('cancel', job_id)
    _announce_control(contract.library_processing_job, job_id, 'stopping')
    live = contract.library_processing_job.snapshot()
    thread = getattr(contract.library_processing_job, 'thread', None)
    if not (live and thread is not None and thread.is_alive()) and not _writer_active(config):
        from .job_recovery import finish
        from .library_processing import _save, state_path
        previous.update(status='cancelled', outcome='cancelled', stage='Stopped', error='')
        _save(state_path(config), previous)
        finish(contract.db_path, 'library-processing', job_id, 'cancelled')
        if previous.get('run_id') is not None:
            contract.library_processing_job.runs.finish(previous['run_id'], 'cancelled')
        contract.library_processing_job.update(job_id, **{
            key:value for key,value in previous.items() if key!='job_id'})
    return q_library_processing(contract, {})


def _set_processing_speed(contract, control, previous, body):
    mode = valid_mode(body.get('speed_mode'))
    control.request('set_speed', mode=mode)
    if previous.get('status') in ACTIVE:
        ratio = mode_ratio(mode, previous.get('speed_mode') or 'standard')
        fields = dict(speed_mode=mode, eta_initial=True)
        if previous.get('speed_mode') != mode:
            for key in ('eta_seconds_min', 'eta_seconds_max'):
                if isinstance(previous.get(key), (int, float)):
                    fields[key] = max(0, int(previous[key] * ratio))
        contract.library_processing_job.update(previous['job_id'], **fields)
    return q_library_processing(contract, {})


def _control_action(contract, config, body):
    action = body['action']
    if action == 'archive':
        return _archive_notice(contract, config, body)
    if action not in ('pause', 'resume', 'set_speed', 'skip_current', 'cancel'):
        raise ValueError('Invalid processing action')
    previous = _current(contract)
    job_id = body.get('job_id')
    if action != 'set_speed' and not job_id:
        raise ValueError('Choose the task being processed')
    if job_id and str(job_id) != str(previous.get('job_id') or ''):
        raise ValueError('The task has changed; refresh the page and try again')
    if action != 'set_speed' and previous.get('status') not in ACTIVE:
        raise ValueError('There is no task to pause or resume')
    control = control_for(config)
    control.refresh(force=True)
    if job_id:
        control.select_job(str(job_id))
    if action == 'cancel':
        return _cancel_processing(contract, config, control, previous, str(job_id))
    if previous.get('status') == 'stopping':
        raise ValueError('Waiting for the task to stop; please retry later')
    if action == 'skip_current':
        _request_skip(control, previous, body)
        return q_library_processing(contract, {})
    if action == 'set_speed':
        return _set_processing_speed(contract, control, previous, body)
    status = ('paused' if previous.get('status') == 'paused' else 'pausing') if action == 'pause' else 'running'
    _announce_control(contract.library_processing_job, str(job_id), status)
    control.request(action, str(job_id))
    live = contract.library_processing_job.snapshot()
    thread = getattr(contract.library_processing_job, 'thread', None)
    if action == 'resume' and not (live and thread is not None and thread.is_alive()) and not _writer_active(config):
        from .job_recovery import read, current_job_id, current_run
        recovery = read(contract.db_path, 'library-processing')
        identity = current_job_id.set(str(job_id))
        run = current_run.set(recovery.get('run_id'))
        try:
            return w_library_processing(contract, {
                'stage': previous.get('requested_stage') or ALL_STAGES,
                **({'incremental': True} if previous.get('incremental') else
                   {'asset_ids': previous['asset_ids']} if previous.get('asset_ids') else {}),
                'speed_mode': control.mode}, resume=True)
        finally:
            current_job_id.reset(identity)
            current_run.reset(run)
    result = q_library_processing(contract, {})
    if not live and result.get('status') in ACTIVE:
        result['status'] = status
    return result


def _announce_control(job, job_id, status):
    with job.editing(job_id) as state:
        if state is not None and state.get('status') in ACTIVE:
            state['status'] = status


def _writer_active(config):
    from filelock import FileLock, Timeout
    from .library_processing import state_path
    try:
        with FileLock(str(state_path(config)) + '.lock', timeout=0):
            return False
    except Timeout:
        return True


def q_library_processing_issues(contract, args):
    state = _current(contract)
    job_id = str(args.get('job_id') or '')
    if not job_id or job_id != str(state.get('job_id') or ''):
        raise ValueError('The task has changed; please refresh the page and retry')
    path = issues_path(settings_file.active(), job_id)
    if path.is_file():
        raw = path.read_text(encoding='utf-8')
        rows = [json.loads(line) for line in raw.splitlines() if line.strip()]
    else:
        rows = []
        if state.get('issue_count'):
            from .library_processing import state_path
            saved = json.loads(state_path(settings_file.active()).read_text(encoding='utf-8'))
            rows = saved.get('issues', [])
            if not rows:
                raise ValueError('The complete problem record was not obtained; please export diagnostic logs')
        raw = json.dumps(rows, ensure_ascii=False)
    revision = hashlib.sha256(raw.encode()).hexdigest()
    if args.get('revision') and args['revision'] != revision:
        raise ValueError('The problem record has changed; please export again')
    offset = max(0, int(args.get('offset') or 0))
    limit = max(1, min(200, int(args.get('limit') or 50)))
    return {'job_id': job_id, 'revision':revision, 'total': len(rows), 'offset': offset,
            'rows': rows[offset:offset + limit]}


def _remaining_retry_ids(contract, previous):
    ids = list(previous.get('retryable_asset_ids') or [])
    if not ids:
        return []
    remaining = set()
    with contract.database.read_connection() as connection:
        for offset in range(0, len(ids), 900):
            batch = ids[offset:offset+900]
            remaining.update(row[0] for row in connection.execute(
                'SELECT id FROM asset WHERE disposal IS NULL AND id IN ('+','.join('?'*len(batch))+')',batch))
    return [value for value in ids if value in remaining]


def _retry_ids(previous, body):
    """请求带 `retry` 时按上一任务的失败集合重试；普通启动仍处理整个馆藏。

    返回 `None` 表示全量任务；返回列表表示只处理这些资产。空列表由调用方
    按「没有可重试项」处理，不允许滑回全库重跑。
    """
    if not body or 'retry' not in body:
        return None
    job_id = str(body.get('job_id') or '')
    if not job_id or job_id != str(previous.get('job_id') or ''):
        raise ValueError('The original task has changed; refresh the page and try again')
    requested = body.get('retry')
    if not isinstance(requested, list):
        raise ValueError('Retry item format is invalid')
    allowed = list(previous.get('retryable_asset_ids') or [])
    if not requested:
        return allowed
    chosen = []
    for value in requested:
        if isinstance(value, bool) or not isinstance(value, int) or value not in allowed:
            raise ValueError('The retry items do not belong to the failure set of the original task')
        chosen.append(value)
    return chosen


def _expand_new_scope(db_path, body):
    """Validate the mutual exclusion between incremental discovery and the set to be completed, and freeze the registered scope."""
    if 'incremental' in body:
        if type(body['incremental']) is not bool:
            raise ValueError('The new-file scope must be a switch value')
        if body['incremental'] and any(key in body for key in ('asset_ids', 'retry', 'scope')):
            raise ValueError('New-file discovery cannot be used together with other processing scopes')
    if 'scope' in body:
        if body['scope'] != 'new' or 'asset_ids' in body or 'retry' in body:
            raise ValueError('The new-import scope cannot be used together with other processing scopes')
        from .library_new_assets import pending
        ids = pending(db_path)
        if not ids:
            raise ValueError('No newly imported movies pending processing')
        body['asset_ids'] = ids


def _processing_request(contract, config, previous, body):
    """校验馆藏、阶段与互斥的处理范围。"""
    if not config.configured or not config.locations:
        raise ValueError('Add a media directory first')
    if contract.db_path.resolve() != (config.directory('database') / 'ledger.db').resolve():
        raise ValueError('The current library and media configuration are inconsistent')
    body = dict(body or {})
    _expand_new_scope(contract.db_path, body)
    retry_ids = _retry_ids(previous, body)
    if 'asset_ids' in (body or {}) and body['asset_ids'] is None:
        raise ValueError('Choose valid video items')
    asset_ids = _asset_selection(contract.db_path, (body or {}).get('asset_ids'))
    if asset_ids is not None and retry_ids is not None:
        raise ValueError('Selected items and failure retry cannot be used together')
    stage = str((body or {}).get('stage') or
                (previous.get('requested_stage') if retry_ids is not None else None) or ALL_STAGES)
    if stage not in STAGES:
        raise ValueError('Invalid processing stage')
    if body.get('incremental') and stage not in (ALL_STAGES, SCAN_STAGE):
        raise ValueError('New-file discovery supports only scan or sync')
    from .media_processing_policy import metadata_only
    if stage == PREVIEWS_STAGE and metadata_only(config.directory('state')):
        raise ValueError('Video preview generation is turned off; turn it on in the library settings first')
    return retry_ids, asset_ids, stage


def w_library_processing(contract, body, *, resume=False):
    config = settings_file.active()
    if (body or {}).get('action'):
        return _control_action(contract, config, body)
    previous = _current(contract)
    if previous.get('status') in ACTIVE and not resume:
        return public_state(previous)
    if (body or {}).get('retry') is not None:
        previous['retryable_asset_ids'] = _remaining_retry_ids(contract, previous)
    retry_ids, asset_ids, stage = _processing_request(contract, config, previous, body)
    incremental = (body or {}).get('incremental', False)
    if (body or {}).get('scope') == 'new':
        from .library_new_assets import remember
        remember(contract.db_path, asset_ids)
    if retry_ids is not None and not retry_ids:
        return public_state(previous)
    mode = valid_mode(control_for(config).mode if resume else
                      (body or {}).get('speed_mode') or control_for(config).mode)
    control_for(config).request('set_speed', mode=mode)
    def work(job_id):
        try:
            result = process_library(config, contract.db_path, contract.candidate_root, contract.cover_root,
                job_id=job_id, retry_ids=retry_ids, stage=stage, asset_ids=asset_ids, incremental=incremental,
                # 自动落库与页面写的是同一个 `LedgerDatabase`：进程内写锁在实例上，
                # 另建一个就是在同一个进程里开第二条写入路径。
                database=contract.database,
                resume_state=previous if resume else None,
                speed_mode=control_for(config).mode,
                active=lambda: (contract.library_processing_job.snapshot() or {}).get('job_id') == job_id,
                report=lambda state: contract.library_processing_job.update(job_id, **{
                    key: value for key, value in state.items() if key != 'job_id'}))
            contract.library_processing_job.update(job_id, **{key: value for key, value in result.items() if key != 'job_id'})
        finally:
            contract.cache_bust()
    # 起步那行字按这一趟真正要做的事写：点了「只扫描」却看到「读取本地资料」，
    # 人会以为点错了。
    labels = {ALL_STAGES: 'Preparing to process', SCAN_STAGE: 'Preparing to scan files', COLLECT_STAGE: 'Preparing to collect metadata',
              METADATA_STAGE: 'Preparing to collect metadata', PREVIEWS_STAGE: 'Preparing to generate previews'}
    estimate_ids = asset_ids if asset_ids is not None else retry_ids
    if incremental:
        from .library_new_assets import pending
        estimate_ids = pending(contract.db_path)
    return public_state(contract.library_processing_job.start(
        work, restart=True, initial={'stage': labels[stage], 'requested_stage': stage,
                                    **initial_estimate(config, contract.db_path, stage, estimate_ids, mode)},
        recovery={'stage': stage, 'speed_mode': mode, 'incremental': incremental,
                  **({'asset_ids': asset_ids or retry_ids}
                                    if asset_ids is not None or retry_ids is not None else {})}))
