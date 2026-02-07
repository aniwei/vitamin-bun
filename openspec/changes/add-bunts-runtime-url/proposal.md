# Change: 添加 BunTS url 核心模块扩展

## Why
当前 `url` 模块仅暴露 `URL` 与 `URLSearchParams`，缺少常用的 `pathToFileURL`/`fileURLToPath`，影响 Node 风格路径处理。

## What Changes
- 扩展 `url` 核心模块，新增 `pathToFileURL` 与 `fileURLToPath`
- 支持 `node:url` 别名

## Impact
- Affected specs: `bunts-runtime-url`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
