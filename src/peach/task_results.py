"""Domain results of the Task Center: details stay where they are, and summaries keep readable counts."""
from __future__ import annotations


RESULT_FIELDS = {
    'link-check': ('gone_count', 'unclear_count'),
    'resource-scan': ('missing', 'unreadable', 'cache_files'),
    'resource-apply': ('cache_blocked_count',),
    'follow-check': ('source_failed', 'source_warning', 'issues'),
    'feed-check': ('source_failed', 'source_warning', 'issues'),
    'follow-resolve': ('resolve_failed', 'sources_found', 'source_failed'),
    'taste-refresh': ('warning_count', 'profiles_checked'),
    'organize': ('skipped',),
}


def _resource_scan_counts(result: dict) -> dict:
    """File, directory and cache counts of a resource scan."""
    summary = {field: result[field] for field in ('missing', 'purge', 'vanish', 'empty', 'unreadable')
               if isinstance(result.get(field), int)}
    cache = result.get('cache') if isinstance(result.get('cache'), dict) else {}
    summary.update({f'cache_{field}': cache[field] for field in ('files', 'bytes')
                    if isinstance(cache.get(field), int)})
    return summary


def _source_check_counts(state: dict) -> dict:
    """Success, new and backfill-failure counts of a source check."""
    rows = [row for row in state['results'] if isinstance(row, dict)]
    summary = {
        'source_failed': sum(row.get('ok') is False for row in rows),
        'source_warning': sum(bool(row.get('backfill_error')) for row in rows),
        'issues': [],
    }
    for row in rows:
        source = row.get('source')
        if not isinstance(source, int) or isinstance(source, bool) or source <= 0:
            continue
        for field, kind in (('error', 'Check failed'), ('backfill_error', 'Backfill failed')):
            if (field == 'error' and row.get('ok') is False) or row.get(field):
                summary['issues'].append({
                    'source': source, 'label': str(row.get('label') or row.get('name') or row.get('ref') or source),
                    'provider': str(row.get('provider_label') or row.get('provider') or ''),
                    'kind': kind, 'error': str(row.get(field) or 'The source returned no check result'),
                })
    for field in ('added', 'updated', 'discovered', 'without_code'):
        if field not in state and any(field in row for row in rows):
            summary[field] = sum(row.get(field, 0) for row in rows
                                 if isinstance(row.get(field, 0), int))
    return summary


def result_counts(task_key: str, state: dict) -> dict:
    """Only known result structures are converted; missing details are not inferred as zero."""
    summary = {}
    if task_key == 'link-check':
        for field in ('gone', 'unclear'):
            if isinstance(state.get(field), list):
                summary[f'{field}_count'] = len(state[field])
    elif task_key == 'resource-scan' and isinstance(state.get('result'), dict):
        summary.update(_resource_scan_counts(state['result']))
    elif task_key == 'resource-apply' and isinstance(state.get('cache_blocked'), list):
        summary['cache_blocked_count'] = len(state['cache_blocked'])
    elif task_key in ('follow-check', 'feed-check') and isinstance(state.get('results'), list):
        summary.update(_source_check_counts(state))
    elif task_key == 'follow-resolve' and isinstance(state.get('results'), list):
        rows = [row for row in state['results'] if isinstance(row, dict)]
        summary['resolve_failed'] = sum(row.get('kind') == 'error' for row in rows)
        summary['source_failed'] = sum(len(row.get('failures') or []) for row in rows)
        summary['sources_found'] = sum(len(row.get('candidates') or []) for row in rows)
    elif task_key == 'taste-refresh':
        if isinstance(state.get('warnings'), list):
            summary['warning_count'] = len(state['warnings'])
        if isinstance(state.get('refresh'), list):
            summary['profiles_checked'] = len(state['refresh'])
    elif task_key == 'organize' and isinstance(state.get('counts'), dict):
        counts = state['counts']
        if isinstance(counts.get('skip'), int):
            summary['skipped'] = counts['skip']
    return summary
