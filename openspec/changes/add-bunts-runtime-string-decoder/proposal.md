# Change: 添加 BunTS string_decoder 核心模块

## Why
部分依赖使用 `string_decoder` 进行字节解码，当前缺失会导致运行失败。

## What Changes
- 新增 `string_decoder` 核心模块与 `node:string_decoder` 别名
- 提供 `StringDecoder`（基于 TextDecoder 的最小实现）

## Impact
- Affected specs: `bunts-runtime-string-decoder`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
