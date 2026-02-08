# Change: Complete process implementation

## Why
当前 process 仅部分字段可用，缺少 Node 常见行为。

## What Changes
- 完善 process 字段与方法（env/cwd/nextTick/argv 等）。
- 明确浏览器限制。

## Impact
- Affected specs: bunts-runtime-process
- Affected code: packages/bunts-runtime/src/core-modules/process.ts, docs/BUN_API_CATALOG.md
