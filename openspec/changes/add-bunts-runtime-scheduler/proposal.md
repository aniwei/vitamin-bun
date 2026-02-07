# Change: 添加 BunTS scheduler 核心模块

## Why
部分依赖使用 `node:scheduler`（或 `scheduler`）进行优先级调度，缺失会导致加载失败。

## What Changes
- 新增 `scheduler` 核心模块与 `node:scheduler` 别名
- 提供最小实现（yield/now）

## Impact
- Affected specs: `bunts-runtime-scheduler`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
