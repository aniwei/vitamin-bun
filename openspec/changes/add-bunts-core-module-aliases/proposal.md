# Change: BunTS Core Modules 别名与 node: 前缀支持

## Why
现代依赖大量使用 `node:` 前缀与子路径（如 `node:fs`, `fs/promises`, `path/posix`）。当前 BunTS 仅支持裸模块名，会导致真实项目无法运行。

## What Changes
- 增加 `node:` 前缀解析（`node:fs` → `fs`）
- 增加核心模块子路径映射（`fs/promises`, `path/posix`, `path/win32`）
- 统一 core module 解析入口，确保 require/import 一致

## Impact
- 影响包：bunts-runtime（ModuleLoader + core-modules）
- 影响模块解析逻辑与测试集
