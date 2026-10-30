"""Background generation, progress and cancellation of diagnostic ZIPs; output is written only to the local cache directory."""
from __future__ import annotations

import re
import threading

from .jobs import BackgroundJob
from .scraping_diagnostics import ExportCancelled, selected_codes


class DiagnosticExports:
    def __init__(self, config):
        self.config = config
        self.root = config.directory('generated') / 'diagnostic-exports'
        self.job = BackgroundJob('PeachDiagnosticExport')
        self.lock = threading.Lock()
        self.cancelled = threading.Event()

    def snapshot(self):
        return self.job.snapshot() or {'status': 'idle'}

    def start(self, kind, codes='', *, report=None, browser=None):
        if kind not in ('support', 'scraping'):
            raise ValueError('Please choose a diagnostic report or scraping record')
        selected_codes(codes)
        with self.lock:
            if self.snapshot()['status'] in ('running', 'cancelling'):
                raise ValueError('A diagnostic export is already running; please wait for it to finish or cancel')
            self.cancelled = threading.Event()
            cancelled = self.cancelled
            previous = self.snapshot().get('job_id', '')
            if re.fullmatch(r'[a-f0-9]{32}', previous):
                try:
                    (self.root / f'{previous}.zip').unlink(missing_ok=True)
                except OSError:
                    pass

            def work(identity):
                self.root.mkdir(parents=True, exist_ok=True)
                pending = self.root / f'{identity}.part'
                final = self.root / f'{identity}.zip'
                def progress(**values):
                    if cancelled.is_set():
                        raise ExportCancelled('Export cancelled')
                    self.job.update(identity, **values)
                try:
                    if kind == 'scraping':
                        from .scraping_diagnostics import bundle_to
                        bundle_to(self.config, pending, codes=codes, progress=progress, cancelled=cancelled.is_set)
                    else:
                        from .support_bundle import bundle_to
                        progress(stage='Reading system diagnostics', done=0, total=0)
                        try:
                            facts = report() if callable(report) else report
                        except Exception:
                            facts = None
                        bundle_to(pending, config=self.config, report=facts, browser=browser,
                                  progress=progress, cancelled=cancelled.is_set)
                    with self.job.editing(identity) as state:
                        if state is None or cancelled.is_set():
                            raise ExportCancelled('Export cancelled')
                        pending.replace(final)
                        state.update(status='complete', stage='Export complete', bytes=final.stat().st_size,
                                     download_url=f'/api/diagnostics/exports/{identity}/download')
                except ExportCancelled:
                    self.job.update(identity, status='cancelled', stage='Export cancelled', error='')
                finally:
                    pending.unlink(missing_ok=True)

            return self.job.start(work, restart=True, initial={'kind': kind, 'stage': 'Preparing export',
                                                              'done': 0, 'total': 0, 'files': 0, 'rows': 0})

    def cancel(self, identity):
        with self.job.editing(identity) as state:
            if state is None:
                raise ValueError('The export task has changed; please refresh and retry')
            if state['status'] in ('running', 'cancelling'):
                self.cancelled.set()
                state.update(status='cancelling', stage='Cancelling export')
        return self.snapshot()

    def download(self, identity):
        if not re.fullmatch(r'[a-f0-9]{32}', identity):
            raise FileNotFoundError('Export task not found')
        state = self.snapshot()
        path = self.root / f'{identity}.zip'
        if state.get('job_id') != identity or state.get('status') != 'complete' or not path.is_file():
            raise FileNotFoundError('The export file is not ready; please regenerate')
        return path, 'peach-scraping.zip' if state['kind'] == 'scraping' else 'peach-support.zip'


_MANAGER_LOCK = threading.Lock()


def manager(request):
    from . import settings_file
    with _MANAGER_LOCK:
        state = request.app.state
        if not hasattr(state, 'diagnostic_exports'):
            state.diagnostic_exports = DiagnosticExports(settings_file.load_config())
        return state.diagnostic_exports
