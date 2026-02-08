# Change: Full bunx + glob + semver implementations

## Why
当前 bunx / bun:glob / bun:semver 仅提供最小实现，无法满足真实依赖与工具链对完整语义的要求。

## What Changes
- 将 bunx 升级为完整实现（解析 package.json bin、支持本地依赖、必要时自动安装/解析并执行）。
- 将 bun:glob 升级为完整 glob 语法与选项（含 ignore/dot/cwd 等）。
- 将 bun:semver 升级为完整语义（范围、预发布、比较与排序等）。
- 增加完整测试覆盖并更新文档状态。

## Impact
- Affected specs: bunts-runtime-cli, bunts-runtime-bun-modules
- Affected code: packages/bunts-runtime/src/runtime-core.ts, packages/bunts-runtime/src/core-modules, packages/bunts-runtime/src/module-loader.ts, docs/BUN_API_CATALOG.md
