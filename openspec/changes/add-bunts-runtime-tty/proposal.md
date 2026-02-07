# Change: 添加 BunTS tty 核心模块

## Why
部分依赖会检测 `tty` 模块来判断 TTY 能力，当前缺失会导致加载失败。

## What Changes
- 新增 `tty` 核心模块与 `node:tty` 别名
- 提供最小 stub（`isatty`/`WriteStream`/`ReadStream`）

## Impact
- Affected specs: `bunts-runtime-tty`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
