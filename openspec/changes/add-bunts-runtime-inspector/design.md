# Design: BunTS inspector 模块

## 范围
提供最小 stub 以满足依赖加载。

## API
- `open()`/`close()`：空函数
- `url()`：返回 `null`

## 模块暴露
- `inspector` 与 `node:inspector` 指向相同实现。
