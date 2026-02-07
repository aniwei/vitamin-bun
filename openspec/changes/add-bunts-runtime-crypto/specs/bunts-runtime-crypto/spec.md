## ADDED Requirements

### Requirement: crypto 模块
系统 SHALL 提供 `crypto` 核心模块。

#### Scenario: randomBytes
- **WHEN** 执行 `randomBytes(16)`
- **THEN** 返回长度为 16 的 Uint8Array

#### Scenario: createHash
- **GIVEN** 输入字符串 "hello"
- **WHEN** `createHash('sha256').update('hello').digest('hex')`
- **THEN** 返回稳定的哈希字符串

### Requirement: node:crypto
系统 SHALL 支持 `node:crypto` 前缀模块。

#### Scenario: node:crypto
- **WHEN** `require('node:crypto')`
- **THEN** 返回 crypto 模块实现
