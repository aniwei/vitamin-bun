# Change: 添加 BunTS assert/strict 模块

## Why
部分依赖会使用 `assert/strict`，当前仅实现 `assert`。

## What Changes
- 新增 `assert/strict` 核心模块
- 复用现有 assert 实现
- 支持 `node:assert/strict` 别名

## Impact
- Affected specs: `bunts-runtime-assert-strict`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
