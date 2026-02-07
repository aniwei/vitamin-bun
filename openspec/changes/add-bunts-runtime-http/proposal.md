# Change: 添加 BunTS http/https 核心模块

## Why
常见依赖会使用 `http`/`https`，当前缺失会导致加载失败。

## What Changes
- 新增 `http` 与 `https` 核心模块
- 提供基于 `fetch` 的最小客户端 API（`request`/`get`）
- 支持 `node:http` 与 `node:https` 别名

## Impact
- Affected specs: `bunts-runtime-http`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
