"""前端类型、样式和文案检查，在行为测试之前执行。"""
import json
from pathlib import Path
import shutil
import subprocess
import unittest

from support.conditions import missing_prerequisite

FRONTEND = Path(__file__).resolve().parents[1] / 'frontend'


def frontend_npm(tool: str, package: str) -> str:
    npm = shutil.which('npm')
    if npm is None:
        missing_prerequisite(f'跳过 {tool}：本机没有 npm。装 Node 24+ 后 `-Scope web` 会带上它')
    if not (FRONTEND / 'node_modules' / package).is_dir():
        missing_prerequisite(f'跳过 {tool}：frontend/node_modules 还没装，先 `npm --prefix frontend ci`')
    return npm


class FrontendPreflightTests(unittest.TestCase):
    def test_the_frontend_sources_typecheck(self):
        npm = frontend_npm('tsc', 'typescript')
        completed = subprocess.run(
            [npm, '--prefix', str(FRONTEND), 'run', 'typecheck', '--silent'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=FRONTEND, check=False)
        self.assertEqual(completed.returncode, 0, f'{completed.stdout}\n{completed.stderr}')

    def test_frontend_sources_and_tests_pass_lint(self):
        npm = frontend_npm('lint', 'oxlint')
        completed = subprocess.run(
            [npm, '--prefix', str(FRONTEND), 'run', 'lint', '--silent', '--', '--format=json'],
            capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=FRONTEND, check=False)
        output = f'{completed.stdout}\n{completed.stderr}'
        self.assertEqual(completed.returncode, 0, output)
        report = json.loads(completed.stdout)
        self.assertEqual(report['diagnostics'], [], output)
        self.assertGreater(report['number_of_files'], 0, output)
        copy = subprocess.run([npm, '--prefix', str(FRONTEND), 'run', 'check:copy'],
                              capture_output=True, text=True, encoding='utf-8', errors='replace', cwd=FRONTEND)
        self.assertEqual(copy.returncode, 0, copy.stdout + copy.stderr)
