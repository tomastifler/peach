"""出网客户端必须写明代理边界，不许默认落到系统代理。

Peach 代理设置（`peach_proxy`）有跟随系统、直连、自定义代理三种。httpx 不写
`trust_env`、curl_cffi 不写 `trust_env`、`urllib.request.urlopen` 都会悄悄读取环境
变量与 Windows 系统代理：用户在配置页选了直连或自定义代理，这些请求照样走系统代理。

所以 `src/peach` 里每个客户端构造都要二选一：
- 用 `**` 展开 Peach 代理设置（`peach_proxy.client_options()`、`curl_options()`，
  或由它们组装出的选项）；
- 写明 `trust_env=False`：只给回环、局域网服务与注入的传输用。
`urlopen` 一律不用，回环请求用 `build_opener(ProxyHandler({}))`，外网走
`peach_proxy.read_url`；`build_opener` 必须带 `ProxyHandler`。
"""
from __future__ import annotations

import ast
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "src" / "peach"
#: 会读环境代理的客户端构造：httpx 的 Client 与模块级快捷函数、curl_cffi 的 Session。
CLIENTS = {"Client", "AsyncClient", "Session", "get", "post", "put", "delete", "head", "stream", "request"}
OWNERS = {"httpx", "requests", "curl_requests"}
IMPORT_SOURCES = {"httpx", "curl_cffi", "curl_cffi.requests", "urllib.request"}


def violations(tree: ast.AST) -> list[tuple[int, str]]:
    found = []
    for node in ast.walk(tree):
        # 裸名导入后的调用看不出归属，扫描器无从判断，直接拒收。
        if isinstance(node, ast.ImportFrom) and node.module in IMPORT_SOURCES:
            found += [(node.lineno, f"from {node.module} import {alias.name} 绕过扫描")
                      for alias in node.names if alias.name in CLIENTS | {"urlopen"}]
            continue
        if not isinstance(node, ast.Call):
            continue
        name = ast.unparse(node.func)
        owner, _, attr = name.rpartition(".")
        if name.endswith("urlopen"):
            found.append((node.lineno, "urlopen 会读系统代理"))
        elif attr == "build_opener":
            if not any(isinstance(arg, ast.Call) and ast.unparse(arg.func).endswith("ProxyHandler")
                       for arg in node.args):
                found.append((node.lineno, "build_opener 没有 ProxyHandler"))
        elif owner.rpartition(".")[2] in OWNERS and attr in CLIENTS:
            spread = any(keyword.arg is None for keyword in node.keywords)
            direct = any(keyword.arg == "trust_env" and isinstance(keyword.value, ast.Constant)
                         and keyword.value.value is False for keyword in node.keywords)
            if not (spread or direct):
                found.append((node.lineno, f"{name} 没有展开 Peach 代理设置，也没写 trust_env=False"))
    return found


class OutboundProxyPolicyTest(unittest.TestCase):
    def test_every_client_states_its_proxy_boundary(self):
        problems = [f"{path.relative_to(ROOT).as_posix()}:{line} {reason}"
                    for path in sorted(SOURCE.rglob("*.py"))
                    for line, reason in violations(ast.parse(path.read_text(encoding="utf-8")))]
        self.assertEqual(problems, [])

    def test_scanner_flags_default_clients(self):
        tree = ast.parse("import httpx, urllib.request\n"
                         "httpx.Client(timeout=3)\n"
                         "httpx.get('https://example.com')\n"
                         "urllib.request.urlopen('http://127.0.0.1')\n"
                         "urllib.request.build_opener()\n"
                         "httpx.Client(**options)\n"
                         "httpx.get('http://127.0.0.1', trust_env=False)\n"
                         "urllib.request.build_opener(urllib.request.ProxyHandler({}))\n"
                         "from httpx import Client\n"
                         "from urllib.request import urlopen, Request\n")
        self.assertEqual(sorted(line for line, _ in violations(tree)), [2, 3, 4, 5, 9, 10])


if __name__ == "__main__":
    unittest.main()
