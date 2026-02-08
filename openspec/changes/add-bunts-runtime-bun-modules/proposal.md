# Change: Bun built-in modules parity (bun:glob/semver/transpiler/sqlite/ffi)

## Why
Bun 内置模块为生态工具链提供关键能力，浏览器运行时缺失这些模块会导致大量依赖无法运行。

## What Changes
- 新增 `bun:glob`、`bun:semver`、`bun:transpiler` 的基础实现（纯 TS，VFS/JS 实现）。
- 为 `bun:sqlite` 与 `bun:ffi` 提供浏览器约束下的稳定错误/插件扩展位。
- 更新文档与测试覆盖。

## Impact
- Affected specs: bunts-runtime-bun-modules
- Affected code: packages/bunts-runtime/src/core-modules, packages/bunts-runtime/src/evaluator.ts, docs/BUN_API_CATALOG.md
