# Design: Events / EventEmitter

## Goals
- 提供 `events` 模块与 EventEmitter
- 兼容 `on`, `once`, `off`, `emit`

## Approach
- 纯 TS 实现 EventEmitter
- 使用 Map<string, Set<fn>> 管理监听器
- `once` 包装函数，触发后移除

## Non-Goals
- 完整 Node 事件内存泄漏警告语义
- 异步事件循环特性
