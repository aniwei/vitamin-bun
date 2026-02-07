# Change: 添加 BunTS diagnostics_channel 核心模块

## Why
部分依赖会检测 `diagnostics_channel`，缺失会导致加载失败。

## What Changes
- 新增 `diagnostics_channel` 核心模块与 `node:diagnostics_channel` 别名
- 提供最小 stub（channel/subscribe/unsubscribe）

## Impact
- Affected specs: `bunts-runtime-diagnostics-channel`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
