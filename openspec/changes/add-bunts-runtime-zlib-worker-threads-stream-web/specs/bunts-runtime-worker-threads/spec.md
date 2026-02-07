## ADDED Requirements

### Requirement: worker_threads core module
The system SHALL provide a `worker_threads` core module with a minimal browser-safe stub.

#### Scenario: worker_threads exports are present
- **WHEN** `require('worker_threads')`
- **THEN** the module exposes `isMainThread`, `threadId`, `parentPort`, `workerData`, and `Worker`

#### Scenario: Worker construction is unsupported
- **WHEN** `new Worker('path')` is called
- **THEN** it throws an error indicating worker_threads is not supported in the browser runtime

### Requirement: node:worker_threads
The system SHALL support the `node:worker_threads` prefixed module.

#### Scenario: node:worker_threads
- **WHEN** `require('node:worker_threads')`
- **THEN** it returns the same implementation as `worker_threads`
