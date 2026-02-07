# Design: Crypto (WebCrypto-backed)

## Goals
- 提供 `crypto` 核心模块的最小子集
- 使用浏览器 WebCrypto API 实现

## API Surface (Minimum)
- `randomBytes(size)`
- `createHash('sha256' | 'sha1' | 'md5'?)` → 返回 `{ update(), digest('hex'|'base64') }`
- `subtle` 直接暴露 `crypto.subtle`

## Notes
- `md5` 在 WebCrypto 不可用，可降级为纯 JS 实现或抛错
- `createHmac` 暂不实现
