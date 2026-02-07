# Change: 添加 BunTS module 核心模块

## Why
部分依赖会直接引用 `module`（或 `node:module`）以获取 `createRequire`。

## What Changes
- 新增 `module` 核心模块与 `node:module` 别名
- 提供 `createRequire`（基于现有 ModuleLoader）

## Impact
- Affected specs: `bunts-runtime-module`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
