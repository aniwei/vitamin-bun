# Change: BunTS Events 模块与 EventEmitter

## Why
大量 Node/Bun 生态依赖 `events` 模块与 `EventEmitter` 行为。当前 BunTS 缺少该核心模块，导致依赖无法运行。

## What Changes
- 增加 `events` 核心模块（`EventEmitter`, `once`, `on`）
- 提供 `node:events` 前缀支持
- 最小兼容 Node 事件语义（listener 注册、移除、同步触发）

## Impact
- 影响包：bunts-runtime（core-modules + module-loader）
- 增加事件模块测试
