# Change: 添加 BunTS stream/promises 模块

## Why
部分依赖使用 `stream/promises` 的 `pipeline`，当前仅在 `stream` 中提供。

## What Changes
- 新增 `stream/promises` 核心模块
- 复用 `stream.pipeline` 并提供 Promise 版本
- 支持 `node:stream/promises` 别名

## Impact
- Affected specs: `bunts-runtime-stream-promises`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
