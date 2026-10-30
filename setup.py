"""将运行时资源装入 wheel，源码树仍是资源的唯一维护位置。"""
from pathlib import Path
import runpy

from setuptools import setup
from setuptools.command.build_py import build_py


class BuildWithResources(build_py):
    def run(self):
        super().run()
        root = Path(__file__).resolve().parent
        destination = Path(self.build_lib) / "peach" / "_resources"
        manifest = runpy.run_path(str(root / 'src/peach/bundle_resources.py'))
        for source, target in manifest['data_files'](root):
            output = destination / target
            if source.is_dir():
                self.copy_tree(str(source), str(output))
            else:
                output.mkdir(parents=True, exist_ok=True)
                self.copy_file(str(source), str(output / source.name))


setup(cmdclass={"build_py": BuildWithResources})
