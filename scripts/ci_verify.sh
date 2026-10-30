#!/usr/bin/env bash
# GitGud 的 Linux 与 macOS 正式回归按 full/changed 计划覆盖，并从有效证明续跑。
# 选测由 scripts/ci_scope.py 判，取不到已验证基线时它给出 full（ADR-0119）。
set -euo pipefail

usage() {
    printf '%s\n' '用法：bash scripts/ci_verify.sh <linux|macos> <full|changed>'
}
if [[ $# -ne 2 ]]; then
    usage >&2
    exit 2
fi
platform="$1"
coverage="$2"
case "$platform" in linux|macos) ;; *) usage >&2; exit 2 ;; esac
case "$coverage" in full|changed) ;; *) usage >&2; exit 2 ;; esac

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
plan=full
if [[ "$coverage" == changed ]]; then
    plan="$(.venv/bin/python -X utf8 scripts/ci_scope.py --platform "$platform")"
fi
base="$(printf '%s\n' "$plan" | head -n 1)"
if [[ "$base" == full ]]; then
    ./scripts/test.sh full --resume
    exit 0
fi
./scripts/test.sh auto --base "$base"
# bash 3.2 没有 mapfile，逐行读选择器。
focus=()
while IFS= read -r selector; do
    if [[ -n "$selector" ]]; then
        focus+=(--focus "$selector")
    fi
done < <(printf '%s\n' "$plan" | tail -n +2)
./scripts/test.sh auto "${focus[@]}"
