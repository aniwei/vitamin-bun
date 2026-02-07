# Change: 扩展 BunTS path 核心模块

## Why
当前 `path` 模块缺少常用的 `parse`/`format`/`isAbsolute` 完整实现，影响依赖使用。

## What Changes
- 扩展 `path` 核心模块，新增 `parse`/`format`
- 支持 `node:path` 别名

## Impact
- Affected specs: `bunts-runtime-path`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
