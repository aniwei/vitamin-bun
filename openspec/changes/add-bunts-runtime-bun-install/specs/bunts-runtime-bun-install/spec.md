## ADDED Requirements

### Requirement: bun install command
The system SHALL support a `bun install` command that installs dependencies into the virtual filesystem.

#### Scenario: install dependencies from package.json
- **WHEN** the VFS contains `package.json` with dependencies
- **THEN** `bun install` writes packages under `/node_modules`

#### Scenario: registry resolution failure
- **WHEN** a dependency cannot be resolved from the registry
- **THEN** the install command fails with an error on stderr and a non-zero exit code

### Requirement: registry fetch
The system SHALL fetch npm registry metadata and tarballs via `fetch`.

#### Scenario: fetch metadata
- **WHEN** a package version is requested
- **THEN** the installer fetches metadata from the configured registry URL

### Requirement: lockfile output
The system SHALL write a minimal lockfile to the VFS after installation.

#### Scenario: write lockfile
- **WHEN** installation succeeds
- **THEN** a lockfile is written to the workspace root
