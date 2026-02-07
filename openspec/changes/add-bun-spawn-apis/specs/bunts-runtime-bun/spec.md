## ADDED Requirements

### Requirement: Bun.spawn
The system SHALL expose `Bun.spawn` to start a command within the browser runtime.

#### Scenario: Spawn basic command
- **WHEN** `Bun.spawn` is called with a command and args
- **THEN** the command runs via the runtime and yields stdout/stderr and exit code

### Requirement: Bun.spawnSync
The system SHALL expose `Bun.spawnSync` as a synchronous-style API with best-effort behavior.

#### Scenario: SpawnSync returns exit status
- **WHEN** `Bun.spawnSync` is called with a command
- **THEN** it returns an object with exit code and output buffers
