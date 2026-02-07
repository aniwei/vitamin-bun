## ADDED Requirements

### Requirement: querystring 核心模块
系统 SHALL 提供 `querystring` 核心模块。

#### Scenario: parse
- **WHEN** 执行 `querystring.parse('a=1&b=2')`
- **THEN** 返回 { a: '1', b: '2' }

#### Scenario: stringify
- **WHEN** 执行 `querystring.stringify({ a: '1', b: '2' })`
- **THEN** 返回包含 `a=1` 与 `b=2` 的字符串

### Requirement: node:querystring
系统 SHALL 支持 `node:querystring` 前缀模块。

#### Scenario: node:querystring
- **WHEN** `require('node:querystring')`
- **THEN** 返回 querystring 模块实现
