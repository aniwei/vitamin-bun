## MODIFIED Requirements

### Requirement: bun:glob module
The runtime SHALL expose a complete `bun:glob` module supporting standard glob patterns (including `**`, `{}` brace expansion, extglob, and ignore rules) and options such as `cwd`, `dot`, `nocase`, `absolute`, and `ignore`.

#### Scenario: Glob with ignore
- **WHEN** a script imports `bun:glob` and searches for `src/**/*.ts` with ignore `src/**/__tests__/*`
- **THEN** the module returns matching VFS paths excluding ignored entries

### Requirement: bun:semver module
The runtime SHALL expose a complete `bun:semver` module with full SemVer parsing, comparison, and range satisfaction including prerelease handling.

#### Scenario: Prerelease range
- **WHEN** a script imports `bun:semver` and checks if `1.2.0-beta.1` satisfies `>=1.2.0-0`
- **THEN** the module reports true
