"""识别测试中以仓库根目录拼出的静态文件输入。"""
from __future__ import annotations

import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WRITES = frozenset({'write_text', 'write_bytes', 'unlink', 'mkdir', 'touch', 'rmdir'})


def repository_paths_read_by(source: str) -> tuple[str, ...]:
    """仅认仓库根和其静态别名；临时夹具中的同名路径不属于仓库输入。"""
    tree = ast.parse(source)
    aliases: dict[str, str] = {'ROOT': ''}

    def relative(node):
        if isinstance(node, ast.Name):
            return aliases.get(node.id)
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Div):
            prefix = relative(node.left)
            if prefix is not None and isinstance(node.right, ast.Constant) and isinstance(node.right.value, str):
                return '/'.join(filter(None, (prefix, node.right.value.strip('/'))))
        return None

    for node in tree.body:
        if isinstance(node, ast.Assign):
            value = relative(node.value)
            if value is not None:
                aliases.update({target.id: value for target in node.targets if isinstance(target, ast.Name)})
    parents = {child: parent for parent in ast.walk(tree) for child in ast.iter_child_nodes(parent)}
    found = set()
    for node in ast.walk(tree):
        name = relative(node)
        if not name or not (ROOT / name).is_file():
            continue
        parent = parents.get(node)
        if isinstance(parent, ast.Attribute) and parent.attr in WRITES:
            continue
        found.add(name)
    return tuple(sorted(found))
