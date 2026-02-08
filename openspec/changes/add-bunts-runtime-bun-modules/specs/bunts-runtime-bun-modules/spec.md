## ADDED Requirements

### Requirement: bun:glob module
The runtime SHALL expose a `bun:glob` module that can resolve glob patterns against the VFS.

#### Scenario: VFS glob lookup
- **WHEN** a script imports `bun:glob` and searches for `src/**/*.ts`
- **THEN** the module returns matching VFS paths

### Requirement: bun:semver module
The runtime SHALL expose a `bun:semver` module that provides minimal semver comparison and range checks.

#### Scenario: Semver compare
- **WHEN** a script imports `bun:semver` and compares `1.2.0` to `1.3.0`
- **THEN** the module reports that `1.2.0` is lower than `1.3.0`

### Requirement: bun:transpiler module
The runtime SHALL expose a `bun:transpiler` module with a minimal `transpile` API for TS/JSX to JS conversion.

#### Scenario: Transpile input
- **WHEN** a script calls `transpile('const a: number = 1')`
- **THEN** the module returns JavaScript output without type annotations

### Requirement: bun:sqlite and bun:ffi constraints
In browser runtime, `bun:sqlite` and `bun:ffi` SHALL emit clear errors unless an explicit plugin/host capability is provided.

#### Scenario: Missing sqlite support
- **WHEN** a script imports `bun:sqlite` without host capability
- **THEN** an error is thrown describing that sqlite is not available in browser runtime
