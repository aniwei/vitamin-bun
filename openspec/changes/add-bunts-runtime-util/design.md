# Design: BunTS util 模块

## 范围
实现 Node.js `util` 的基础子集，满足日志格式化与类型判断需求。

## API
- `format(...args)`：支持 `%s`/`%d`/`%j`/`%%`
- `inspect(value, options?)`：输出可读字符串（浅层）
- `types` 子集：`isDate`、`isRegExp`、`isPromise`

## 模块暴露
- `util` 与 `node:util` 指向相同实现。
