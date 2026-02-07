# Design: BunTS path 模块扩展

## 范围
在现有 `path` 模块基础上补充 `parse` 与 `format`。

## API
- `parse(path)`：返回 { root, dir, base, ext, name }
- `format(obj)`：从片段拼接路径

## 模块暴露
- `path` 与 `node:path` 指向相同实现。
