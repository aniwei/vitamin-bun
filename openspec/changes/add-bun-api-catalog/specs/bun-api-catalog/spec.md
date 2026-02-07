## ADDED Requirements

### Requirement: Bun API catalog
The system SHALL maintain a Bun API catalog covering runtime, CLI, built-in modules, and Node compatibility APIs.

#### Scenario: catalog completeness
- **WHEN** the catalog is generated
- **THEN** it lists all APIs referenced in the official Bun docs

### Requirement: API status tracking
The system SHALL track each API as implemented, partial, or missing with test coverage references.

#### Scenario: status entry
- **WHEN** an API is listed
- **THEN** its status and tests are recorded

### Requirement: Staged implementation plan
The system SHALL define a phased plan with Network + IO as Phase 1 priority.

#### Scenario: phase priority
- **WHEN** planning work
- **THEN** Network + IO APIs are addressed before CLI and other modules
