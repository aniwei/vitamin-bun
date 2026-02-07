# Change: 添加 BunTS constants 核心模块

## Why
部分依赖会引用 `constants`（或 `node:constants`）获取系统常量，占位缺失会导致加载失败。

## What Changes
- 新增 `constants` 核心模块与 `node:constants` 别名
- 提供最小常量集合（空对象或少量常见值）

## Impact
- Affected specs: `bunts-runtime-constants`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
