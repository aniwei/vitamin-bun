# Change: Bun install parity (staged)

## Why
Dependencies expect Bun's install behavior. The browser runtime currently implements a minimal subset, which limits real-world usage.

## What Changes
- Implement a staged bun install roadmap toward parity with Bun, with mixed browser/Node constraints.
- Expand registry resolution, semver, tarball integrity, and node_modules layout.
- Add support for workspaces, peer/optional dependencies, and lifecycle hooks (where possible in browser).
- Document feature gaps and execution constraints.
- Add tests for key install flows.

## Impact
- Affected specs: bunts-runtime-bun-install
- Affected code: packages/bunts-runtime/src/bun-install.ts, packages/sdk/src/container.ts, docs/BUN_API_CATALOG.md
