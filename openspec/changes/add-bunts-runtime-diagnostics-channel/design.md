# Design: BunTS diagnostics_channel 模块

## 范围
提供最小 stub 以满足依赖加载。

## API
- `channel(name)`：返回对象，包含 `subscribe`/`unsubscribe`/`publish`

## 模块暴露
- `diagnostics_channel` 与 `node:diagnostics_channel` 指向相同实现。
