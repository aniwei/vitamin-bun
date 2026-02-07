# Design: BunTS stream 模块

## 范围
实现 Node.js `stream` 的基础子集，满足简单读写与 transform 场景。

## API
- `Readable`：构造、`push`、`readable` 事件
- `Writable`：构造、`write`、`end`
- `Transform`：继承 Writable/Readable，提供 `_transform`
- 工具函数：`pipeline`（Promise 版本）

## 语义
- 采用事件驱动（`data`/`end`/`error`）
- 仅支持对象模式关闭（binary/string）

## 模块暴露
- `stream` 与 `node:stream` 指向相同实现。
