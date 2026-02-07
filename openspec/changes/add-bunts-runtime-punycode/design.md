# Design: BunTS punycode 模块

## 范围
提供最小 `toASCII`/`toUnicode` 实现，基于 `URL`。

## API
- `toASCII(domain)`
- `toUnicode(domain)`

## 模块暴露
- `punycode` 与 `node:punycode` 指向相同实现。
