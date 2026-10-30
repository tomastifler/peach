"""README 的安装要求与双语入口。"""
from pathlib import Path
import tempfile
import unittest

from scripts.check_readme_impact import READMES, installation_contracts

ROOT = Path(__file__).resolve().parents[1]


class ReadmeContractsTests(unittest.TestCase):
    def test_repository_readmes_satisfy_installation_contracts(self):
        self.assertEqual(installation_contracts(ROOT), [])

    def test_installation_check_accepts_equivalent_floor_notation_and_reports_missing_links(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory).resolve()
            (root / 'pyproject.toml').write_text('[project]\nrequires-python = ">=3.14"\n', encoding='utf-8')
            for suffix in ('+', ' or newer', ' 或更高'):
                for name in READMES:
                    counterpart, = READMES - {name}
                    (root / name).write_text(f'Python 3.14{suffix}\n[Language]({counterpart})\n', encoding='utf-8')
                self.assertEqual(installation_contracts(root), [])
            (root / 'README.md').write_text('Python 3.13+\n', encoding='utf-8')
            self.assertEqual(installation_contracts(root), ['README.md: Python 下限须为 3.14',
                                                           'README.md: 缺少语言入口 README.zh-CN.md'])
