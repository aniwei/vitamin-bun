## MODIFIED Requirements

### Requirement: net/tls parity
The runtime SHALL provide Node-compatible net/tls APIs within browser proxy constraints.

#### Scenario: tls connect
- **WHEN** a script opens a TLS connection
- **THEN** it can read/write data via the proxy layer
