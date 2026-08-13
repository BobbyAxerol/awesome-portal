#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git -C "${ROOT_DIR}" rev-parse --is-inside-work-tree >/dev/null
git -C "${ROOT_DIR}" config core.hooksPath .githooks
printf 'Enabled parent workspace hooks from %s/.githooks\n' "${ROOT_DIR}"
