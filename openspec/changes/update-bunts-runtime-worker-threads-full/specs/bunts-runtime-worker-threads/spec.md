## MODIFIED Requirements

### Requirement: worker_threads parity
The runtime SHALL provide worker_threads APIs with browser-backed workers and message channels.

#### Scenario: Worker message
- **WHEN** a worker posts a message
- **THEN** the parent receives it via parentPort
