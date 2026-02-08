## ADDED Requirements

### Requirement: CLI command routing
The runtime SHALL route `bun build`, `bun test`, `bun update`, `bun create`, `bun pm`, and `bunx` to command handlers in RuntimeCore.

#### Scenario: Command dispatch
- **WHEN** `exec('bun', ['build'])` is invoked
- **THEN** the build handler is executed and an exit code is returned

### Requirement: Browser-safe fallbacks
When a CLI command cannot run in a browser context, the runtime SHALL return a non-zero exit code and emit a clear stderr message describing the limitation.

#### Scenario: Unsupported command in browser
- **WHEN** `exec('bun', ['test'])` is invoked but the test runner is unavailable
- **THEN** exit code is non-zero and stderr mentions that the command is not yet supported in browser runtime

### Requirement: bunx resolution surface
The runtime SHALL support a minimal `bunx` resolution flow that attempts to locate binaries in the VFS `node_modules/.bin` (or emits a clear error when missing).

#### Scenario: bunx cannot resolve binary
- **WHEN** `exec('bun', ['x', 'demo'])` is invoked and no binary exists in `node_modules/.bin`
- **THEN** exit code is non-zero and stderr explains the missing binary
