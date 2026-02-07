# Design: BunTS process 模块扩展

## 范围
在现有 `process` 基础上补充常见只读属性。

## API
- `process.platform`：`"browser"`
- `process.arch`：`"wasm"`
- `process.version`：`"v0.0.0-bunts"`
- `process.versions`：包含 `bunts: "0.0.0"`
