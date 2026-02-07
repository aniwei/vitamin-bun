## ADDED Requirements

### Requirement: stream 核心模块
系统 SHALL 提供 `stream` 核心模块。

#### Scenario: Readable
- **WHEN** 创建 Readable 并 push 数据
- **THEN** 触发 `data` 事件并输出数据

#### Scenario: Writable
- **WHEN** 写入数据并调用 `end`
- **THEN** 触发 `finish` 事件

#### Scenario: Transform
- **GIVEN** 一个 Transform
- **WHEN** 写入数据
- **THEN** 输出转换后的数据

### Requirement: node:stream
系统 SHALL 支持 `node:stream` 前缀模块。

#### Scenario: node:stream
- **WHEN** `require('node:stream')`
- **THEN** 返回 stream 模块实现
