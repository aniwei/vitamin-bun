## MODIFIED Requirements

### Requirement: stream parity
The runtime SHALL provide Node-compatible stream APIs with correct backpressure semantics.

#### Scenario: pipeline
- **WHEN** pipeline is used with readable/writable streams
- **THEN** data flows and errors propagate as in Node
