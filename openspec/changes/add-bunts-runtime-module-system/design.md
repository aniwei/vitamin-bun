# Design: BunTS Module System & Core API Polyfills

## Goals
- 解析 `package.json`（`main`/`module`/`exports`）
- 支持 ESM 与 CJS 的混合加载
- 提供核心 Node/Bun API polyfill 的最小集合

## Module Resolution
优先级：
1. `exports` 映射（仅支持 string/条件分支的最小子集）
2. `module` (ESM)
3. `main` (CJS)
4. 默认 `index.*`

## Polyfill Scope
- `path`: join/dirname/extname/resolve
- `fs`: readFile/writeFile/readdir/exists
- `process`: env/argv/cwd
- `buffer`: 基础 Buffer shim
- `url`: URL/URLSearchParams

## Non-Goals
- 完整 Node 兼容与原生 addons
- npm 全量语义
