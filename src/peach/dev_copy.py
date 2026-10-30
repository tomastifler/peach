"""Copy-editing tool for source checkouts: locate copy text and count templates, check the file digest, then save."""
from __future__ import annotations
import ast
from collections import Counter
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import re
from string import Formatter


def files(root: Path):
    yield root / "web/index.html"
    yield root / "src/peach/library_sharing.py"
    yield root / "src/peach/library_processing.py"
    yield root / "src/peach/routes_pages.py"
    yield root / "src/peach/onboarding.py"
    yield root / "src/peach/media_sources.py"
    yield from sorted((root / "frontend/src").rglob("*.js"))
    yield from sorted((root / "frontend/src").rglob("*.tsx"))
    yield from sorted((root / "frontend/src").rglob("*.ts"))


def _template_parts(node: ast.JoinedStr):
    """Placeholders only name existing expressions; format and evaluation code are kept by the AST."""
    fields = {}
    parts = []
    for value in node.values:
        if isinstance(value, ast.Constant):
            parts.append(value.value.replace("{", "{{").replace("}", "}}"))
        else:
            name = value.value.id if isinstance(value.value, ast.Name) else f"value{len(fields) + 1}"
            while name in fields:
                name += "_"
            fields[name] = value
            parts.append("{" + name + "}")
    return "".join(parts), fields


def _python_candidates(source: str, original: str):
    tree = ast.parse(source)
    inside_template = {id(child) for node in ast.walk(tree) if isinstance(node, ast.JoinedStr)
                       for child in ast.walk(node) if child is not node}
    lines = source.splitlines(keepends=True)

    def offset(line, column):
        return sum(map(len, lines[:line - 1])) + len(lines[line - 1].encode("utf-8")[:column].decode("utf-8"))

    for node in ast.walk(tree):
        if id(node) in inside_template:
            continue
        extra = {}
        if isinstance(node, ast.JoinedStr):
            template, fields = _template_parts(node)
            parsed = list(Formatter().parse(template))
            if not any(literal.strip() for literal, _, _, _ in parsed):
                continue
            pattern = "".join(re.escape(literal) + (f"(?P<{name}>.*?)" if name else "")
                              for literal, name, _, _ in parsed)
            match = re.fullmatch(pattern, original, re.DOTALL)
            if not match or not fields:
                continue
            extra = {"template": template, "values": match.groupdict()}
        elif not isinstance(node, ast.Constant) or node.value != original:
            continue
        yield {"start": offset(node.lineno, node.col_offset),
               "end": offset(node.end_lineno, node.end_col_offset), "line": node.lineno,
               "quote": "", "python": True, **extra}


def _python_replacement(source: str, selected: dict, replacement: str):
    expression = source[selected["start"]:selected["end"]]
    if "template" not in selected:
        return (json.dumps(replacement, ensure_ascii=False) if expression.startswith('"') else repr(replacement)), replacement
    node = ast.parse("(" + expression + ")", mode="eval").body
    _, fields = _template_parts(node)
    values, rendered, used = [], [], []
    try:
        for literal, name, spec, conversion in Formatter().parse(replacement):
            if literal:
                values.append(ast.Constant(literal))
                rendered.append(literal)
            if name is not None:
                if name not in fields or spec or conversion:
                    raise ValueError("Keep the original placeholders and change only the text")
                used.append(name)
                values.append(deepcopy(fields[name]))
                rendered.append(selected["values"][name])
    except ValueError as error:
        raise ValueError("Keep the original placeholders and change only the text; write literal braces as {{ and }}") from error
    if Counter(used) != Counter(fields.keys()):
        raise ValueError("Keep all placeholders, each appearing once")
    return ast.unparse(ast.JoinedStr(values)), "".join(rendered)


def candidates(root: Path, original: str) -> list[dict]:
    if not isinstance(original, str) or not original.strip() or len(original) > 2000:
        raise ValueError("Please choose copy of at most 2000 characters")
    found = []
    for path in files(root):
        if not path.is_file() or ".test." in path.name:
            continue
        source = path.read_text(encoding="utf-8")
        if len(source) > 2_000_000:
            continue
        if path.suffix == ".py":
            found.extend({"file": path.relative_to(root).as_posix(),
                          "hash": hashlib.sha256(source.encode()).hexdigest(), **candidate}
                         for candidate in _python_candidates(source, original))
            continue
        # 只定位完整文字节点或完整字符串，避免改到标识和代码的一部分。
        pattern = re.compile(r"(?P<quote>['\"`])" + re.escape(original) + r"(?P=quote)|>\s*(?P<jsx>" + re.escape(original) + r")\s*<")
        for match in pattern.finditer(source):
            start = match.start("jsx") if match.group("jsx") else match.start() + 1
            end = start + len(original)
            found.append({"file": path.relative_to(root).as_posix(), "start": start, "end": end,
                          "hash": hashlib.sha256(source.encode()).hexdigest(),
                          "line": source[:start].count("\n") + 1,
                          "quote": match.group("quote") or ""})
    return found[:100]


def save(root: Path, body: dict) -> dict:
    if not isinstance(body, dict):
        raise ValueError("The edit must be an object")
    original, replacement = body.get("original", ""), body.get("replacement", "")
    if not isinstance(replacement, str) or len(replacement) > 2000:
        raise ValueError("New copy must be text of at most 2000 characters")
    selected = body.get("candidate")
    if selected not in candidates(root, original):
        raise ValueError("The source file has changed; select the text again")
    path = (root / selected["file"]).resolve()
    if path not in {p.resolve() for p in files(root)}:
        raise ValueError("This file cannot be modified")
    source = path.read_text(encoding="utf-8")
    quote = selected["quote"]
    text = replacement
    if selected.get("python"):
        escaped, text = _python_replacement(source, selected, replacement)
    elif quote:
        escaped = replacement.replace("\\", "\\\\").replace(quote, "\\" + quote).replace("\n", "\\n").replace("\r", "\\r")
        if quote == "`":
            escaped = escaped.replace("${", "\\${")
    else:
        escaped = replacement.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if path.suffix == ".tsx":
            escaped = escaped.replace("{", "&#123;").replace("}", "&#125;")
    backup = root / "build/copy-editor/backups" / selected["hash"] / selected["file"]
    backup.parent.mkdir(parents=True, exist_ok=True)
    if not backup.exists():
        backup.write_text(source, encoding="utf-8")
    path.write_text(source[:selected["start"]] + escaped + source[selected["end"]:], encoding="utf-8")
    record = root / "build/copy-editor/edits.json"
    edits = json.loads(record.read_text(encoding="utf-8")) if record.exists() else {}
    edits[original] = text
    record.write_text(json.dumps(edits, ensure_ascii=False, indent=2), encoding="utf-8")
    return {"ok": True, "file": selected["file"], "text": text,
            "needs_build": selected["file"].startswith("frontend/")}
