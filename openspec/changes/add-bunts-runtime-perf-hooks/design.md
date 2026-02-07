# Design: BunTS perf_hooks 模块

## 范围
提供基于浏览器 `performance` 的最小实现。

## API
- `performance.now()`
- `performance.timeOrigin`

## 模块暴露
- `perf_hooks` 与 `node:perf_hooks` 指向相同实现。
