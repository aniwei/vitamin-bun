## Context
Bun API surface spans runtime globals, CLI commands, built-in modules, and Node compatibility layers. We need a catalog derived from Bun docs, with staging so we can prioritize core runtime (network/IO) first.

## Goals / Non-Goals
- Goals:
  - A complete Bun API catalog derived from official docs.
  - A staged implementation plan with phase gates and tests.
  - A consistent mapping between catalog items and code modules.
- Non-Goals:
  - Implement every API in a single change.
  - Mirror Bun behavior where browsers cannot support it (document limits instead).

## Decisions
- Decision: Maintain a catalog file grouped by Runtime / CLI / Built-in Modules / Node compatibility.
- Decision: Phase 1 prioritizes Network + IO APIs; later phases cover tooling and edge features.
- Decision: Each catalog entry links to status (implemented/missing/partial) and test coverage.

## Risks / Trade-offs
- Catalog drift as Bun docs evolve; will require periodic refresh.
- Some APIs cannot be fully implemented in browser; must document limitations.

## Migration Plan
- Phase 0: Add catalog and baseline status.
- Phase 1: Implement Network + IO group and tests.
- Phase 2+: Iterate remaining groups.

## Open Questions
- Do we want an automated doc sync to refresh the catalog?
- Should status tracking live in the catalog file or in OpenSpec tasks?
