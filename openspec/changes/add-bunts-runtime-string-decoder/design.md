# Design: BunTS string_decoder 模块

## 范围
提供基于 `TextDecoder` 的最小 `StringDecoder` 实现。

## API
- `new StringDecoder(encoding?)`
- `write(buffer)`
- `end(buffer?)`

## 模块暴露
- `string_decoder` 与 `node:string_decoder` 指向相同实现。
