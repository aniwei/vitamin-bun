# Design: BunTS tty 模块

## 范围
提供最小 stub 以满足依赖加载。

## API
- `isatty(fd)`：始终返回 false
- `WriteStream`/`ReadStream`：最小占位类

## 模块暴露
- `tty` 与 `node:tty` 指向相同实现。
