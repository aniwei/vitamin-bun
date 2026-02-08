## MODIFIED Requirements

### Requirement: http/https parity
The runtime SHALL provide Node-compatible http/https client APIs within browser constraints.

#### Scenario: http request
- **WHEN** a script issues an http.request
- **THEN** it receives response events and data as expected
