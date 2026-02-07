# Design: BunTS stream/promises 模块

## 范围
提供 `pipeline` 的 Promise 版本，复用现有 stream 实现。

## API
- `pipeline(...streams)`：返回 Promise

## 模块暴露
- `stream/promises` 与 `node:stream/promises` 指向相同实现。
