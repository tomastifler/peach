"""Source code, wheel and desktop builds share this read-only manifest of runtime resources."""
from pathlib import Path


def data_files(root):
    root = Path(root).resolve()
    seed = root / 'resources/seed/entities.json'
    if not seed.is_file():
        raise FileNotFoundError(f'Missing public entity seed pack: {seed}')
    resources = [(root / name, name) for name in ('web', 'migrations', 'resources')]
    resources += [(root / 'tools/amane-bridge' / name, 'tools/amane-bridge')
                  for name in ('bridge.py', 'pyproject.toml', 'uv.lock')]
    for source, _target in resources:
        if not source.exists():
            raise FileNotFoundError(source)
    return resources


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', required=True, type=Path)
    args = parser.parse_args()
    for source, target in data_files(args.root):
        print(f'{source};{target}')
