# Change: 添加 BunTS inspector 核心模块

## Why
部分依赖在浏览器环境会检测 `inspector` 存在与否。

## What Changes
- 新增 `inspector` 核心模块与 `node:inspector` 别名
- 提供最小 stub（`open`/`close`/`url`）

## Impact
- Affected specs: `bunts-runtime-inspector`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
