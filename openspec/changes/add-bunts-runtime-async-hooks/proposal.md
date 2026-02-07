# Change: 添加 BunTS async_hooks 核心模块

## Why
部分依赖在初始化阶段会 import `async_hooks`，即便不使用完整功能。

## What Changes
- 新增 `async_hooks` 核心模块与 `node:async_hooks` 别名
- 提供最小 stub（返回空 hooks）

## Impact
- Affected specs: `bunts-runtime-async-hooks`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
