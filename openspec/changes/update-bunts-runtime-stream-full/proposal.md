# Change: Complete stream implementation

## Why
当前 stream 实现为子集，缺少完整 Node stream API。

## What Changes
- 实现完整 stream/stream.promises API 与背压语义。
- 补充兼容性测试与文档说明。

## Impact
- Affected specs: bunts-runtime-stream
- Affected code: packages/bunts-runtime/src/core-modules/stream.ts, docs/BUN_API_CATALOG.md
