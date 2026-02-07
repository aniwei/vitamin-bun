# Design: BunTS http/https 模块

## 范围
在浏览器环境中提供最小 `http`/`https` 客户端实现。

## API
- `request(url, options?, callback?)`：返回对象，包含 `end`，并触发 `response`
- `get(url, options?, callback?)`：等同 `request` 后立即 `end`

## 行为
- 基于 `fetch` 发起请求
- `IncomingMessage` 仅提供 `statusCode`/`headers`/`text()`

## 模块暴露
- `http`/`https` 与 `node:http`/`node:https` 指向相同实现。
