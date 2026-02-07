# Change: 添加 BunTS net/tls 核心模块

## Why
部分依赖会引用 `net`/`tls`，浏览器环境下缺失会导致加载失败。

## What Changes
- 新增 `net` 与 `tls` 核心模块
- 提供最小 stub（`connect` 返回占位 socket）
- 支持 `node:net` 与 `node:tls` 别名

## Impact
- Affected specs: `bunts-runtime-net`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
