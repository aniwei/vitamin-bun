# Change: 添加 BunTS stream 核心模块

## Why
缺少 `stream` 核心模块会阻碍依赖 Node.js 流接口的常见库运行。

## What Changes
- 新增 `stream` 核心模块与 `node:stream` 别名
- 提供基础流实现（Readable/Writable/Transform 的最小子集）

## Impact
- Affected specs: `bunts-runtime-stream`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
