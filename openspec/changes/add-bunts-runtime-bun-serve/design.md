## Context
Bun.serve requires a browser-safe server abstraction. We will proxy HTTP/WS through a Service Worker and route to BunTS handlers in the worker runtime.

## Goals / Non-Goals
- Goals:
  - Provide `Bun.serve({ fetch })` with Request -> Response semantics
  - Support routes, headers, streaming responses
  - Support WebSocket upgrade via Service Worker relay
  - Support TLS via proxy configuration (not raw TLS sockets)
- Non-Goals:
  - Full Node http server API
  - Direct TCP/TLS sockets in browser

## Decisions
- Use `@vitamin-ai/network-proxy` Service Worker for interception and forwarding
- Use message channel between Service Worker and BunTS worker runtime
- Treat TLS as a proxy concern (https URL routing only)

## Risks / Trade-offs
- Service Worker lifecycle can drop in-flight requests
- WebSocket bridging is limited by browser SW capabilities

## Migration Plan
- None (new capability)

## Open Questions
- Should we persist route registrations across reloads?
- How to expose server close/shutdown semantics in browser?
