## ADDED Requirements

### Requirement: zlib core module
The system SHALL provide a `zlib` core module with minimal sync exports and clear unsupported errors.

#### Scenario: zlib exports are present
- **WHEN** `require('zlib')`
- **THEN** the module exposes `deflateSync`, `inflateSync`, `gzipSync`, `gunzipSync`, `brotliCompressSync`, `brotliDecompressSync`, and `constants`

#### Scenario: zlib methods are unsupported
- **WHEN** `zlib.gzipSync()` is called
- **THEN** it throws an error indicating zlib is not supported in the browser runtime

### Requirement: node:zlib
The system SHALL support the `node:zlib` prefixed module.

#### Scenario: node:zlib
- **WHEN** `require('node:zlib')`
- **THEN** it returns the same implementation as `zlib`
