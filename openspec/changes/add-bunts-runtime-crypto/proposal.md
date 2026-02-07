# Change: BunTS Crypto 模块（基于 WebCrypto）

## Why
大量依赖使用 `crypto` / `node:crypto` 的 hash、randomBytes、createHash 等基础能力。当前 BunTS 缺少 crypto 模块，阻碍常见库运行。

## What Changes
- 增加 `crypto` 核心模块（`randomBytes`, `createHash`, `subtle`）
- 支持 `node:crypto` 前缀
- 以 WebCrypto 为底层实现（浏览器原生）

## Impact
- 影响包：bunts-runtime（core-modules + module-loader）
- 增加 crypto 基础测试
