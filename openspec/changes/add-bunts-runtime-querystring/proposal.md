# Change: 添加 BunTS querystring 核心模块

## Why
缺少 `querystring` 模块会导致依赖老式 URL 编解码的库无法运行。

## What Changes
- 新增 `querystring` 核心模块与 `node:querystring` 别名
- 提供 `parse` 与 `stringify`

## Impact
- Affected specs: `bunts-runtime-querystring`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
