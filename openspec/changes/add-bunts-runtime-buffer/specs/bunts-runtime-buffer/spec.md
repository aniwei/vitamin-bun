## ADDED Requirements

### Requirement: buffer 扩展
系统 SHALL 在 `buffer` 核心模块中提供 `Buffer.alloc` 与 `Buffer.concat`。

#### Scenario: alloc
- **WHEN** 执行 `Buffer.alloc(2, 1)`
- **THEN** 返回长度 2 且填充值为 1 的 Uint8Array

#### Scenario: concat
- **WHEN** 执行 `Buffer.concat([Buffer.from('a'), Buffer.from('b')])`
- **THEN** 返回内容为 "ab" 的 Uint8Array

### Requirement: node:buffer
系统 SHALL 支持 `node:buffer` 前缀模块。

#### Scenario: node:buffer
- **WHEN** `require('node:buffer')`
- **THEN** 返回 buffer 模块实现
