# Change: BunTS Timers 与 process.nextTick 兼容

## Why
当前 BunTS 运行时尚未提供 `timers` 模块与 `process.nextTick` 的兼容实现，导致大量依赖无法运行。需要补齐基础计时与微任务调度能力。

## What Changes
- 提供 `timers` 核心模块（`setTimeout`, `setInterval`, `setImmediate`, `clear*`）
- 实现 `process.nextTick` 与 `queueMicrotask` 兼容
- 增加 `node:timers` 与 `timers/promises` 最小子集支持

## Impact
- 影响包：bunts-runtime（core-modules + polyfill + ModuleLoader）
- 增加计时相关测试
