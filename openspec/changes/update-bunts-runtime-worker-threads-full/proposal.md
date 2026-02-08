# Change: Complete worker_threads implementation

## Why
当前 worker_threads 为部分实现，缺少完整线程 API 与消息语义。

## What Changes
- 完整实现 worker_threads API（Worker, MessagePort/Channel, parentPort）。
- 规范生命周期与资源回收。
- 增加测试覆盖与文档说明。

## Impact
- Affected specs: bunts-runtime-worker-threads
- Affected code: packages/bunts-runtime/src/core-modules/worker-threads.ts, docs/BUN_API_CATALOG.md
