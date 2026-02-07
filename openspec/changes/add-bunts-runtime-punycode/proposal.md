# Change: 添加 BunTS punycode 核心模块

## Why
部分依赖会引用 `punycode`，缺失会导致加载失败。

## What Changes
- 新增 `punycode` 核心模块与 `node:punycode` 别名
- 提供最小实现（基于 URL 域名转换）

## Impact
- Affected specs: `bunts-runtime-punycode`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
