# Change: 扩展 BunTS buffer 核心模块

## Why
当前 `buffer` 模块仅提供 `Buffer.from`，缺少常用的 `alloc` 与 `concat`，影响依赖运行。

## What Changes
- 扩展 `buffer` 核心模块，新增 `Buffer.alloc` 与 `Buffer.concat`
- 支持 `node:buffer` 别名

## Impact
- Affected specs: `bunts-runtime-buffer`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
