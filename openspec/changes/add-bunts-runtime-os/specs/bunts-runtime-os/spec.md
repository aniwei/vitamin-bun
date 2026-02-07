## ADDED Requirements

### Requirement: os 核心模块
系统 SHALL 提供 `os` 核心模块。

#### Scenario: platform
- **WHEN** 执行 `os.platform()`
- **THEN** 返回 `"browser"`

#### Scenario: arch
- **WHEN** 执行 `os.arch()`
- **THEN** 返回 `"wasm"`

#### Scenario: homedir
- **WHEN** 执行 `os.homedir()`
- **THEN** 返回 `"/"`

#### Scenario: tmpdir
- **WHEN** 执行 `os.tmpdir()`
- **THEN** 返回 `"/tmp"`

### Requirement: node:os
系统 SHALL 支持 `node:os` 前缀模块。

#### Scenario: node:os
- **WHEN** `require('node:os')`
- **THEN** 返回 os 模块实现
