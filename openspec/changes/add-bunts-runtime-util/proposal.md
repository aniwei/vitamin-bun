# Change: 添加 BunTS util 核心模块

## Why
缺少 `util` 核心模块会阻碍常见依赖与调试工具运行。

## What Changes
- 新增 `util` 核心模块与 `node:util` 别名
- 提供基础实用函数（`format`/`inspect`/`types` 子集）

## Impact
- Affected specs: `bunts-runtime-util`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
