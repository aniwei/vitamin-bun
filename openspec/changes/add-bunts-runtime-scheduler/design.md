# Design: BunTS scheduler 模块

## 范围
提供最小 scheduler 实现以满足依赖加载。

## API
- `yield()`：返回 Promise
- `now()`：返回 number（ms）

## 模块暴露
- `scheduler` 与 `node:scheduler` 指向相同实现。
