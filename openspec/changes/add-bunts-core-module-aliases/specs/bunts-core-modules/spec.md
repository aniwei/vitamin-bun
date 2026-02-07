## ADDED Requirements

### Requirement: node: 前缀解析
系统 SHALL 支持 `node:` 前缀的核心模块解析。

#### Scenario: node:fs
- **WHEN** 代码执行 `require('node:fs')`
- **THEN** 返回 `fs` 核心模块实现

### Requirement: 核心模块子路径
系统 SHALL 支持核心模块子路径解析。

#### Scenario: fs/promises
- **WHEN** 代码执行 `import { readFile } from 'fs/promises'`
- **THEN** `readFile` SHALL 可读取 VFS 文件

#### Scenario: path/posix
- **WHEN** 代码执行 `import path from 'path/posix'`
- **THEN** `path.join('/a','b')` SHALL 返回 `/a/b`
