# Design: BunTS net/tls 模块

## 范围
提供最小 stub 以满足依赖加载。

## API
- `net.connect()`：返回 socket，占位对象
- `tls.connect()`：返回 socket，占位对象

## socket 行为
- `on`/`write`/`end` 空实现

## 模块暴露
- `net`/`tls` 与 `node:net`/`node:tls` 指向相同实现。
