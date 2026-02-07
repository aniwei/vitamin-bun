# Design: BunTS async_hooks 模块

## 范围
提供最小 stub 以满足依赖加载。

## API
- `createHook()`：返回对象，包含 `enable`/`disable` 空函数

## 模块暴露
- `async_hooks` 与 `node:async_hooks` 指向相同实现。
