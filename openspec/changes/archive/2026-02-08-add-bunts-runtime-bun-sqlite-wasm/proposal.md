# Change: bun:sqlite via WASM sqlite npm package

## Why
当前 bun:sqlite 在浏览器运行时仅给出不可用错误，阻碍依赖 SQLite 的工具与应用在浏览器端运行。

## What Changes
- 采用 npm 的 WASM SQLite 包实现 bun:sqlite 基础能力。
- 提供初始化、执行 SQL、读取结果的最小可用 API。
- 明确浏览器环境限制与性能注意事项。
- 增加测试覆盖并更新文档状态。

## Impact
- Affected specs: bunts-runtime-bun-modules
- Affected code: packages/bunts-runtime/src/core-modules/bun-sqlite.ts, docs/BUN_API_CATALOG.md
