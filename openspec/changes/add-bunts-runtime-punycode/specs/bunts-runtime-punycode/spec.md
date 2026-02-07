## ADDED Requirements

### Requirement: punycode 核心模块
系统 SHALL 提供 `punycode` 核心模块（最小实现）。

#### Scenario: toASCII
- **WHEN** 调用 `punycode.toASCII('例子.测试')`
- **THEN** 返回字符串

#### Scenario: toUnicode
- **WHEN** 调用 `punycode.toUnicode('xn--fsqu00a.xn--0zwm56d')`
- **THEN** 返回字符串

### Requirement: node:punycode
系统 SHALL 支持 `node:punycode` 前缀模块。

#### Scenario: node:punycode
- **WHEN** `require('node:punycode')`
- **THEN** 返回 punycode 模块实现
