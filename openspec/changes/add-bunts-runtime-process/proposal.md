# Change: 扩展 BunTS process 核心模块

## Why
当前 `process` 仅包含基础 env/argv/cwd/stdout/stderr/nextTick，缺少常见运行期属性。

## What Changes
- 扩展 `process` 暴露 `platform`/`arch`/`version`/`versions`

## Impact
- Affected specs: `bunts-runtime-process`
- Affected code: `packages/bunts-runtime/src/polyfill.ts`
