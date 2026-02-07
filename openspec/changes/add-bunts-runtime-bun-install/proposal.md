# Change: Add BunTS bun install support

## Why
Browser runtime users expect `bun install` to resolve and install dependencies into the virtual filesystem. Missing support blocks realistic workflows.

## What Changes
- Add a minimal `bun install` command implementation for the BunTS runtime
- Resolve dependencies from `package.json` and install into `/node_modules`
- Support npm registry downloads over fetch with integrity checks
- **BREAKING**: None

## Impact
- Affected specs: `bunts-runtime-bun-install`
- Affected code: `packages/bunts-runtime/src/runtime-core.ts`, `packages/bunts-runtime/src/evaluator.ts`, `packages/bunts-runtime/src/core-modules/*`, `packages/sdk/src/container.ts`
