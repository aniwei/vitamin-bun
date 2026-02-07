# Design: BunTS fs 模块扩展

## 范围
补充基础文件系统 API，覆盖常见包的最小需求。

## API
- `fs.statSync`/`fs.stat`
- `fs.mkdirSync`/`fs.mkdir`
- `fs.rmSync`/`fs.rm`
- `fs/promises` 对应异步版本

## 模块暴露
- `fs`/`fs/promises` 与 `node:fs`/`node:fs/promises` 指向相同实现。
