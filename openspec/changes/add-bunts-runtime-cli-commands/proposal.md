# Change: Bun CLI commands parity (build/test/update/create/pm/bunx)

## Why
当前运行时只暴露 `bun run` 与 `bun install`，缺少常用 CLI 命令，导致工具链无法在浏览器中完成基本工作流。

## What Changes
- 新增 `bun build` / `bun test` / `bun update` / `bun create` / `bun pm` / `bunx` 的命令路由与最小可用行为。
- 在浏览器环境下明确每个命令的约束与降级行为。
- 为 CLI 命令提供基础测试与文档说明。

## Impact
- Affected specs: bunts-runtime-cli
- Affected code: packages/bunts-runtime/src/runtime-core.ts, packages/bunts-runtime/src/bun-runtime.ts, docs/BUN_API_CATALOG.md
