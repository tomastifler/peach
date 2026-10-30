"""Allowlist of exception types, frames and build mappings for the official frontend bundle."""
import re
import uuid

NAMES = frozenset({"Error", "TypeError", "ReferenceError", "SyntaxError", "RangeError", "URIError",
    "EvalError", "AggregateError", "DOMException", "SecurityError", "NotAllowedError", "InvalidStateError",
    "QuotaExceededError", "NotSupportedError", "TimeoutError", "NetworkError", "DataError", "OperationError"})
#: A chunk split out of the main bundle by page chunk (ADR-0118): `peach-app.<name>-<content-hash>.js`, produced by
#: `frontend/scripts/sentry-build.ts`'s `chunkPattern` produces it. The name contains only letters and digits, `_` and `-`,
#: contains no path separators or `..`; Existence is judged by `web/dist/` the actual files in it. Server-side allowance and dev copy hot replacement
#: and the build check all go by it to recognize a chunk.
BUNDLE_CHUNK_NAME = re.compile(r"peach-app\.[A-Za-z0-9_-]+\.js")
#: File names in the official bundle: the main entry, page bundles, and the chunk (same shape as `BUNDLE_CHUNK_NAME`).
SHIPPED = r"peach-pages\.js|peach-app(?:\.[A-Za-z0-9_-]+)?\.js"
_SHIPPED = re.compile(SHIPPED)
_FRAME = re.compile(rf"(?<![\w.-])({SHIPPED})(?:\?[^\s):]*)?:(\d+):(\d+)")
#: Maximum frames an event carries, and also the upper bound for mapping entries.
MAX_FRAMES = 20


def shipped(name) -> bool:
    """Whether this is an official-bundle JavaScript."""
    return isinstance(name, str) and _SHIPPED.fullmatch(name) is not None


def project(fields):
    frames = []
    for line in str(fields.get("stack", "")).splitlines()[:80]:
        if "chrome-extension://" in line or "moz-extension://" in line:
            continue
        for name, row, column in _FRAME.findall(line):
            frames.append({"filename": name, "abs_path": "app:///" + name,
                           "lineno": int(row), "colno": int(column)})
    frames = list(reversed(frames[:MAX_FRAMES]))
    if not frames and shipped(fields.get("source_file")):
        row, column = fields.get("line"), fields.get("column")
        if type(row) is int and type(column) is int and row > 0 and column > 0:
            bundle = fields["source_file"]
            frames = [{"filename": bundle, "abs_path": "app:///" + bundle, "lineno": row, "colno": column}]
    name = fields.get("error_name")
    name = name if name in NAMES else "BrowserError"
    value = {"type": name, "value": name, "stacktrace": {"frames": frames}}
    images = []
    identities = fields.get("bundle_debug_ids", {})
    if isinstance(identities, dict):
        for bundle in sorted({frame["filename"] for frame in frames}):
            candidate = identities.get(bundle)
            if not isinstance(candidate, str) or len(candidate) != 36:
                continue
            try:
                identity = uuid.UUID(candidate)
                if identity.int and str(identity) == candidate.lower():
                    images.append({"type": "sourcemap", "code_file": "app:///" + bundle, "debug_id": str(identity)})
            except ValueError:
                continue
    return value, {"images": images} if images else None


def clean_debug_meta(value):
    """SDK scope must not add arbitrary mapping metadata to restricted events."""
    if not isinstance(value, dict) or not isinstance(value.get("images"), list):
        return None
    identities = {}
    for image in value["images"][:MAX_FRAMES]:
        if isinstance(image, dict) and image.get("type") == "sourcemap":
            code = image.get("code_file")
            if isinstance(code, str) and code.startswith("app:///") and shipped(code[len("app:///"):]):
                identities[code[len("app:///"):]] = image.get("debug_id")
    fields = {"stack": "\n".join(bundle + ":1:1" for bundle in sorted(identities)), "bundle_debug_ids": identities}
    return project(fields)[1]
