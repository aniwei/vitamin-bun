# Change: Complete crypto module implementation

## Why
当前 crypto 仅部分映射 WebCrypto，缺少 Node 兼容语义。

## What Changes
- 完整实现 crypto 主要 API（hash, hmac, random, subtle helpers 等）。
- 明确浏览器限制并提供兼容行为。
- 补充测试覆盖与文档说明。

## Impact
- Affected specs: bunts-runtime-crypto
- Affected code: packages/bunts-runtime/src/core-modules/crypto.ts, docs/BUN_API_CATALOG.md
