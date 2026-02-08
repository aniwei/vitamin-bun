## MODIFIED Requirements

### Requirement: crypto parity
The runtime SHALL provide Node-compatible crypto APIs with WebCrypto-backed behavior where possible.

#### Scenario: Hash and HMAC
- **WHEN** a script creates a hash/HMAC
- **THEN** the result matches Node semantics
