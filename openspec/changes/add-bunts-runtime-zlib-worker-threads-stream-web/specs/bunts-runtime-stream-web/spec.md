## ADDED Requirements

### Requirement: stream/web core module
The system SHALL provide a `stream/web` core module that re-exports Web Streams globals.

#### Scenario: stream/web exports Web Streams constructors
- **WHEN** `require('stream/web')`
- **THEN** the module exposes `ReadableStream`, `WritableStream`, and `TransformStream` as the global constructors when available

#### Scenario: optional Web Streams constructors
- **WHEN** optional globals like `TextEncoderStream` or `CompressionStream` are not available
- **THEN** the module exports `undefined` for those fields

### Requirement: node:stream/web
The system SHALL support the `node:stream/web` prefixed module.

#### Scenario: node:stream/web
- **WHEN** `require('node:stream/web')`
- **THEN** it returns the same implementation as `stream/web`
