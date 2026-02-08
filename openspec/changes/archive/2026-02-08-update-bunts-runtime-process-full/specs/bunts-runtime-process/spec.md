## ADDED Requirements

### Requirement: process parity
The runtime SHALL provide Node-compatible process APIs within browser constraints.

#### Scenario: process.env
- **WHEN** a script reads process.env
- **THEN** values reflect runtime env configuration
