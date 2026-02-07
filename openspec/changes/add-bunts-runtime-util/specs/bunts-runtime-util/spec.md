## ADDED Requirements

### Requirement: util 核心模块
系统 SHALL 提供 `util` 核心模块。

#### Scenario: format
- **WHEN** 执行 `util.format('hello %s', 'world')`
- **THEN** 返回 `"hello world"`

#### Scenario: inspect
- **WHEN** 执行 `util.inspect({ a: 1 })`
- **THEN** 返回包含 `a: 1` 的字符串

#### Scenario: types
- **WHEN** 执行 `util.types.isDate(new Date())`
- **THEN** 返回 `true`

### Requirement: node:util
系统 SHALL 支持 `node:util` 前缀模块。

#### Scenario: node:util
- **WHEN** `require('node:util')`
- **THEN** 返回 util 模块实现
