# Change: Complete net/tls implementation

## Why
当前 net/tls 仅有基本代理能力，缺少 Node 语义。

## What Changes
- 完善 net/tls socket API 语义（事件、超时、connect）。
- 明确浏览器限制与代理策略。

## Impact
- Affected specs: bunts-runtime-net
- Affected code: packages/bunts-runtime/src/core-modules/net.ts, packages/bunts-runtime/src/core-modules/tls.ts, docs/BUN_API_CATALOG.md
