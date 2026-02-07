# Change: 添加 BunTS perf_hooks 核心模块

## Why
部分依赖使用 `perf_hooks` 获取性能时间点，当前缺失会导致运行失败。

## What Changes
- 新增 `perf_hooks` 核心模块与 `node:perf_hooks` 别名
- 提供 `performance.now()` 与 `performance.timeOrigin`

## Impact
- Affected specs: `bunts-runtime-perf-hooks`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
