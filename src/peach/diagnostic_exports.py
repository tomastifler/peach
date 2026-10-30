"""诊断 ZIP 的后台生成、进度与取消；产物只写本机缓存目录。"""
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
            raise ValueError('请选择诊断报告或刮削记录')
        selected_codes(codes)
        with self.lock:
            if self.snapshot()['status'] in ('running', 'cancelling'):
                raise ValueError('已有诊断导出正在进行，请等待完成或取消')
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
                        raise ExportCancelled('导出已取消')
                    self.job.update(identity, **values)
                try:
                    if kind == 'scraping':
                        from .scraping_diagnostics import bundle_to
                        bundle_to(self.config, pending, codes=codes, progress=progress, cancelled=cancelled.is_set)
                    else:
                        from .support_bundle import bundle_to
                        progress(stage='读取系统诊断', done=0, total=0)
                        try:
                            facts = report() if callable(report) else report
                        except Exception:
                            facts = None
                        bundle_to(pending, config=self.config, report=facts, browser=browser,
                                  progress=progress, cancelled=cancelled.is_set)
                    with self.job.editing(identity) as state:
                        if state is None or cancelled.is_set():
                            raise ExportCancelled('导出已取消')
                        pending.replace(final)
                        state.update(status='complete', stage='导出已完成', bytes=final.stat().st_size,
                                     download_url=f'/api/diagnostics/exports/{identity}/download')
                except ExportCancelled:
                    self.job.update(identity, status='cancelled', stage='导出已取消', error='')
                finally:
                    pending.unlink(missing_ok=True)

            return self.job.start(work, restart=True, initial={'kind': kind, 'stage': '准备导出',
                                                              'done': 0, 'total': 0, 'files': 0, 'rows': 0})

    def cancel(self, identity):
        with self.job.editing(identity) as state:
            if state is None:
                raise ValueError('导出任务已变化，请刷新后重试')
            if state['status'] in ('running', 'cancelling'):
                self.cancelled.set()
                state.update(status='cancelling', stage='正在取消导出')
        return self.snapshot()

    def download(self, identity):
        if not re.fullmatch(r'[a-f0-9]{32}', identity):
            raise FileNotFoundError('导出任务未取得')
        state = self.snapshot()
        path = self.root / f'{identity}.zip'
        if state.get('job_id') != identity or state.get('status') != 'complete' or not path.is_file():
            raise FileNotFoundError('导出文件尚未就绪，请重新生成')
        return path, 'peach-scraping.zip' if state['kind'] == 'scraping' else 'peach-support.zip'


_MANAGER_LOCK = threading.Lock()


def manager(request):
    from . import settings_file
    with _MANAGER_LOCK:
        state = request.app.state
        if not hasattr(state, 'diagnostic_exports'):
            state.diagnostic_exports = DiagnosticExports(settings_file.load_config())
        return state.diagnostic_exports
