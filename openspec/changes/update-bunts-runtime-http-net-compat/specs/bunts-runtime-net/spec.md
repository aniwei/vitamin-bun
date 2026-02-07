## ADDED Requirements

### Requirement: net socket proxy
The system SHALL provide `net.connect` backed by the Service Worker proxy.

#### Scenario: connect and data
- **WHEN** `net.connect({ host, port })` is called
- **THEN** the socket emits `connect` and can `write`/`end` with `data` events

### Requirement: tls socket proxy
The system SHALL provide `tls.connect` backed by the Service Worker proxy.

#### Scenario: TLS connect
- **WHEN** `tls.connect({ host, port })` is called
- **THEN** the socket emits `secureConnect` and can `write`/`end`

### Requirement: node:net and node:tls aliases
The system SHALL support `node:net` and `node:tls` aliases.

#### Scenario: node:net
- **WHEN** `require('node:net')`
- **THEN** the net implementation is returned

#### Scenario: node:tls
- **WHEN** `require('node:tls')`
- **THEN** the tls implementation is returned

### Requirement: compatibility warnings
The system SHALL emit warnings when unsupported options are provided.

#### Scenario: unsupported option
- **WHEN** a client or socket option is not supported in browsers
- **THEN** a warning is emitted explaining the limitation
