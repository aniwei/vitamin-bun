#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET_DIR="$ROOT_DIR/tests/upstream"

mkdir -p "$TARGET_DIR"

if [[ -d "$TARGET_DIR/bun/.git" ]]; then
  echo "bun repo already exists at $TARGET_DIR/bun"
else
  git clone --depth=1 https://github.com/oven-sh/bun "$TARGET_DIR/bun"
fi

if [[ -d "$TARGET_DIR/node/.git" ]]; then
  echo "node repo already exists at $TARGET_DIR/node"
else
  git clone --depth=1 https://github.com/nodejs/node "$TARGET_DIR/node"
fi

echo "Upstream tests fetched into $TARGET_DIR"
