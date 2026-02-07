# Design: Core Module Aliases

## Goals
- 支持 `node:` 前缀与核心模块子路径
- 与现有 core modules 保持一致的导出语义

## Aliases
- `node:fs` → `fs`
- `node:path` → `path`
- `node:process` → `process`
- `node:buffer` → `buffer`
- `node:url` → `url`

## Subpaths
- `fs/promises` → { ...fs, promises: { readFile, writeFile, readdir } }
- `path/posix` → `path`
- `path/win32` → `path`

## Notes
- 暂不实现完整 Windows 路径语义，仅提供 alias 以保证兼容。
