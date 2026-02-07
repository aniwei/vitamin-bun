## ADDED Requirements

### Requirement: process 扩展
系统 SHALL 在 `process` 上提供 `platform`、`arch`、`version`、`versions`。

#### Scenario: platform
- **WHEN** 读取 `process.platform`
- **THEN** 返回 `"browser"`

#### Scenario: arch
- **WHEN** 读取 `process.arch`
- **THEN** 返回 `"wasm"`

#### Scenario: version
- **WHEN** 读取 `process.version`
- **THEN** 返回以 `v` 开头的字符串

#### Scenario: versions
- **WHEN** 读取 `process.versions.bunts`
- **THEN** 返回版本字符串
