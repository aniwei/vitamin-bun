## Context
The runtime currently exposes isolated hooks (e.g., module load). As features grow (N-API, custom module loaders, network policy), we need a consistent plugin API with ordering, lifecycle, and error isolation.

## Goals / Non-Goals
- Goals:
  - Deterministic plugin ordering with explicit priorities.
  - Hook chaining and short-circuiting for module resolution/load.
  - Lifecycle hooks for init/dispose and diagnostics.
  - Clear error handling and tracing of plugin execution.
- Non-Goals:
  - Full sandbox isolation between plugins.
  - Arbitrary code execution outside runtime context.

## Decisions
- Decision: Define a `RuntimePlugin` interface with metadata (`name`, `version`, `priority`) and optional hooks.
- Decision: Plugin hooks run in priority order (highest first) and can return a `next` result to allow chaining.
- Decision: Provide a `PluginContext` for logging, env access, and runtime references.
- Decision: Support both global registration (SDK options) and per-runtime registration.

## Risks / Trade-offs
- Complexity: More hook surface area increases maintenance cost.
- Compatibility: Hook ordering could change behavior; we will require explicit priorities.

## Migration Plan
- Start with module hooks + lifecycle hooks in phase 1.
- Add network/fs hooks in phase 2 after module hooks are stable.

## Open Questions
- Should we allow dynamic plugin loading at runtime?
- Should plugin errors be fatal or downgraded to warnings by default?
