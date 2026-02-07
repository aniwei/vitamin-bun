## ADDED Requirements

### Requirement: url 扩展
系统 SHALL 在 `url` 核心模块中提供 `pathToFileURL` 与 `fileURLToPath`。

#### Scenario: pathToFileURL
- **WHEN** 执行 `pathToFileURL('/data.txt')`
- **THEN** 返回以 `file://` 开头的 URL

#### Scenario: fileURLToPath
- **GIVEN** `file:///data.txt`
- **WHEN** 执行 `fileURLToPath(url)`
- **THEN** 返回 `/data.txt`

### Requirement: node:url
系统 SHALL 支持 `node:url` 前缀模块。

#### Scenario: node:url
- **WHEN** `require('node:url')`
- **THEN** 返回 url 模块实现
