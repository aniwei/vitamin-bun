# Design Notes

## Scope and constraints
- Browser-first runtime: prefer fetch/Web APIs; Node-only helpers allowed for tooling where explicitly labeled.
- Staged parity: implement core install features first, then expand to workspaces and lifecycle hooks.

## Execution model
- Use existing RuntimeCore exec entry to run bun install in the container.
- Keep install output deterministic and record lockfile updates.

## Safety
- Avoid executing arbitrary scripts in browser by default; gate lifecycle hooks with explicit option.
