# Change: Complete async_hooks implementation

## Why
现有 async_hooks 仅提供最小实现，无法满足 AsyncResource/AsyncLocalStorage 与完整生命周期跟踪需求。

## What Changes
- 实现完整的 async_hooks API（AsyncHook 生命周期、AsyncResource、AsyncLocalStorage）。
- 统一触发/执行上下文的管理与追踪。
- 补充测试覆盖与文档说明。

## Impact
- Affected specs: bunts-runtime-async-hooks
- Affected code: packages/bunts-runtime/src/core-modules/async-hooks.ts, packages/bunts-runtime/src/evaluator.ts, docs/BUN_API_CATALOG.md
