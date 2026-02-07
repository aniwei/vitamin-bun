# Design: Timers & nextTick

## Goals
- 提供与 Node/Bun 相似的 timers API
- 实现 `process.nextTick` 语义（优先于 Promise 微任务）
- 支持 `node:timers` 与 `timers/promises` 基础能力

## Approach
- `timers` 直接代理浏览器 `setTimeout` / `setInterval`
- `setImmediate` 通过 `MessageChannel` 或 `setTimeout(0)` 实现
- `process.nextTick` 使用任务队列与 `queueMicrotask` 驱动

## Non-Goals
- 精确的事件循环阶段兼容
- 高精度计时（纳秒级）
