# Design: BunTS buffer 模块扩展

## 范围
在现有 Buffer 类基础上补充常见静态方法。

## API
- `Buffer.alloc(size, fill?)`
- `Buffer.concat(list)`

## 模块暴露
- `buffer` 与 `node:buffer` 指向相同实现。
