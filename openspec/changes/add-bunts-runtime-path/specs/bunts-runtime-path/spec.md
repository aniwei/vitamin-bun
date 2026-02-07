## ADDED Requirements

### Requirement: path 扩展
系统 SHALL 在 `path` 核心模块中提供 `parse` 与 `format`。

#### Scenario: parse
- **WHEN** 执行 `path.parse('/a/b.txt')`
- **THEN** `base` 为 `b.txt`

#### Scenario: format
- **GIVEN** { dir: '/a', base: 'b.txt' }
- **WHEN** 执行 `path.format(obj)`
- **THEN** 返回 `/a/b.txt`

### Requirement: node:path
系统 SHALL 支持 `node:path` 前缀模块。

#### Scenario: node:path
- **WHEN** `require('node:path')`
- **THEN** 返回 path 模块实现
