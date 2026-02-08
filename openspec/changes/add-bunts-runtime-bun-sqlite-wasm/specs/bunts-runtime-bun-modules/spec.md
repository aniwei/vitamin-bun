## MODIFIED Requirements

### Requirement: bun:sqlite module
The runtime SHALL expose a `bun:sqlite` module backed by a WASM SQLite implementation suitable for browser environments.

#### Scenario: Execute basic SQL
- **WHEN** a script opens an in-memory database and runs `CREATE TABLE` + `INSERT` + `SELECT`
- **THEN** bun:sqlite returns rows matching the inserted values

### Requirement: Browser constraints
The runtime SHALL document browser-specific limitations for bun:sqlite (memory limits, WASM initialization time, persistence constraints).

#### Scenario: Initialization in browser
- **WHEN** bun:sqlite initializes in browser runtime
- **THEN** it reports any constraints or fallback behavior in documentation
