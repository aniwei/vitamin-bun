# Change: 添加 BunTS os 核心模块

## Why
缺少 `os` 核心模块会导致依赖平台信息的库无法运行。

## What Changes
- 新增 `os` 核心模块与 `node:os` 别名
- 提供基础平台信息 API（`platform`/`arch`/`cpus`/`homedir`/`tmpdir`/`EOL`）

## Impact
- Affected specs: `bunts-runtime-os`
- Affected code: `packages/bunts-runtime/src/core-modules.ts`, `packages/bunts-runtime/src/module-loader.ts`
