## ADDED Requirements

### Requirement: http/https client subset
The system SHALL provide a Node-like client API for `http` and `https` with `request` and `get`.

#### Scenario: basic request
- **WHEN** `http.request(url, options)` is called with method/headers/body
- **THEN** a request object is returned and emits `response`

#### Scenario: redirects and timeouts
- **WHEN** a request receives redirects or exceeds timeout
- **THEN** the client follows redirects and emits timeout errors per options

### Requirement: http/https server subset
The system SHALL provide `http.createServer` with a Server that accepts requests through the SW bridge.

#### Scenario: createServer
- **WHEN** `http.createServer(handler).listen(port)` is called
- **THEN** incoming requests are delivered as `IncomingMessage` and `ServerResponse`

### Requirement: Agent compatibility
The system SHALL provide an `Agent` that supports keep-alive and basic pooling hints.

#### Scenario: keep-alive
- **WHEN** `new http.Agent({ keepAlive: true })` is used
- **THEN** subsequent requests reuse connections where possible

### Requirement: node:http and node:https aliases
The system SHALL support `node:http` and `node:https` aliases.

#### Scenario: node:http
- **WHEN** `require('node:http')`
- **THEN** the http implementation is returned

#### Scenario: node:https
- **WHEN** `require('node:https')`
- **THEN** the https implementation is returned
