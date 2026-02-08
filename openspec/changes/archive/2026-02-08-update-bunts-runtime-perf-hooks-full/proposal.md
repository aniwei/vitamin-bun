# Change: Complete perf_hooks implementation and shared SimpleEmitter

## Why
当前 perf_hooks 仅暴露最小 performance API，缺少 Node 常用能力（mark/measure/observer/timerify）。同时多个模块重复实现 SimpleEmitter，维护成本高。

## What Changes
- 完整实现 perf_hooks 的浏览器兼容版 API：performance entries、mark/measure、PerformanceObserver、timerify 等。
- 明确浏览器限制下不可用或降级的接口（如 eventLoopUtilization/monitorEventLoopDelay）。
- 抽取 SimpleEmitter 为共享工具，替换 http/net/worker_threads 内部实现。

## Impact
- Affected specs: bunts-runtime-perf-hooks
- Affected code: packages/bunts-runtime/src/core-modules/perf-hooks.ts, packages/bunts-runtime/src/core-modules/http.ts, packages/bunts-runtime/src/core-modules/net.ts, packages/bunts-runtime/src/core-modules/worker-threads.ts, docs/BUN_API_CATALOG.md
