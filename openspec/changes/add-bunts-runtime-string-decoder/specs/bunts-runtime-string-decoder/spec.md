## ADDED Requirements

### Requirement: string_decoder 核心模块
系统 SHALL 提供 `string_decoder` 核心模块。

#### Scenario: write
- **WHEN** 使用 `StringDecoder` 解码 Uint8Array
- **THEN** 返回字符串

### Requirement: node:string_decoder
系统 SHALL 支持 `node:string_decoder` 前缀模块。

#### Scenario: node:string_decoder
- **WHEN** `require('node:string_decoder')`
- **THEN** 返回 string_decoder 模块实现
