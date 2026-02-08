## MODIFIED Requirements

### Requirement: bunx resolution surface
The runtime SHALL provide a complete `bunx` implementation, including package.json `bin` resolution, workspace/local dependency resolution, and execution with correct argv/cwd/env handling.

#### Scenario: Resolve bin from package.json
- **WHEN** `exec('bun', ['x', 'demo'])` is invoked and `node_modules/demo/package.json` defines a `bin`
- **THEN** bunx resolves the correct executable path and runs it

#### Scenario: Missing binary
- **WHEN** `exec('bun', ['x', 'demo'])` is invoked and no `bin` is available
- **THEN** bunx returns non-zero with a clear error
