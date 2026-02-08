# Change: Complete http/https implementation

## Why
当前 http/https 为 fetch-backed 子集，缺少 Node 语义与选项支持。

## What Changes
- 完善 http/https 客户端与 Agent 行为。
- 明确浏览器约束与降级。

## Impact
- Affected specs: bunts-runtime-http
- Affected code: packages/bunts-runtime/src/core-modules/http.ts, docs/BUN_API_CATALOG.md
