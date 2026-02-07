## ADDED Requirements

### Requirement: fs 扩展
系统 SHALL 在 `fs`/`fs/promises` 中提供 `stat`/`mkdir`/`rm`。

#### Scenario: stat
- **WHEN** 执行 `fs.statSync('/data.txt')`
- **THEN** 返回包含 `isFile()` 的对象

#### Scenario: mkdir
- **WHEN** 执行 `fs.mkdirSync('/dir')`
- **THEN** 目录创建成功

#### Scenario: rm
- **WHEN** 执行 `fs.rmSync('/data.txt')`
- **THEN** 文件被删除

### Requirement: node:fs/promises
系统 SHALL 支持 `node:fs` 与 `node:fs/promises` 前缀模块。

#### Scenario: node:fs
- **WHEN** `require('node:fs')`
- **THEN** 返回 fs 模块实现

#### Scenario: node:fs/promises
- **WHEN** `require('node:fs/promises')`
- **THEN** 返回 fs/promises 模块实现
