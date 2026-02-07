# Change: Add Bun API catalog and staged coverage plan

## Why
We need a complete, structured Bun API inventory aligned with official docs to drive implementation parity and avoid missing runtime/CLI/module features.

## What Changes
- Create a comprehensive Bun API catalog (runtime, CLI, built-in modules, Node compatibility).
- Define a staged coverage plan with explicit priorities (Phase 1: Network and IO).
- Add validation criteria and tracking for implemented vs missing APIs.

## Impact
- Affected specs: `bun-api-catalog`
- Affected code: `packages/bunts-runtime/src/*`, `packages/sdk/src/*`, `packages/browser-runtime/src/*`, `packages/network-proxy/src/*`
