## ADDED Requirements

### Requirement: Bun.serve handler
The system SHALL provide `Bun.serve({ fetch })` to handle HTTP requests in the browser runtime.

#### Scenario: handle request
- **WHEN** a request is forwarded via the Service Worker
- **THEN** the `fetch` handler returns a Response used for the client

### Requirement: Routing support
The system SHALL support basic routing by path and method within Bun.serve handlers.

#### Scenario: route match
- **WHEN** a request matches a configured route
- **THEN** the handler returns the route response

### Requirement: Streaming responses
The system SHALL allow streaming Response bodies from Bun.serve.

#### Scenario: stream response
- **WHEN** the handler returns a streaming Response
- **THEN** the client receives streamed data

### Requirement: WebSocket relay
The system SHALL support best-effort WebSocket relay via the Service Worker bridge.

#### Scenario: websocket upgrade
- **WHEN** a WebSocket request is received
- **THEN** the bridge connects and relays messages

### Requirement: TLS proxy mode
The system SHALL support HTTPS forwarding through the proxy bridge (no raw TLS sockets).

#### Scenario: https request
- **WHEN** a request is made over https
- **THEN** it is forwarded through the proxy and handled by Bun.serve
