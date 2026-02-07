# Change: 扩展 BunTS fs 核心模块

## Why
当前 `fs`/`fs/promises` 缺少 `stat`/`mkdir`/`rm`，影响依赖文件操作能力。

## What Changes
- 扩展 `fs`/`fs/promises`，新增 `stat`/`mkdir`/`rm`
- 支持 `node:fs` 与 `node:fs/promises` 别名

## Impact
- Affected specs: `bunts-runtime-fs-extra`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
