## Context
Browser containers cannot access raw TCP or TLS sockets. All networking must flow through Web APIs (fetch/WebSocket/Service Worker). The goal is to emulate the most-used Node.js APIs with safe fallbacks.

## Goals / Non-Goals
- Goals: Provide a practical Node-compatible subset for `http`/`https`/`net`/`tls`.
- Goals: Preserve Bun.serve integration for server-style handlers.
- Non-Goals: Full Node TCP semantics (half-open, SO_* options, raw TLS cert control).

## Decisions
- Decision: Implement `http`/`https` client on top of fetch with a Node-like request object.
- Decision: Map `http.createServer` to Bun.serve, exposing IncomingMessage/ServerResponse wrappers.
- Decision: Provide `net`/`tls` sockets via SW WebSocket tunnel, with Node-like events.
- Decision: Emit warnings for unsupported options to avoid silent incompatibility.

## Risks / Trade-offs
- Fetch semantics differ from Node streams; wrappers must be explicit.
- WebSocket proxy adds latency and cannot fully match TCP behavior.

## Migration Plan
- Introduce new modules alongside existing stubs.
- Keep aliases (`node:http`, `node:https`, `node:net`, `node:tls`).
- Update docs/examples to set expectations.

## Open Questions
- Which request options should be treated as errors vs warnings?
- Do we need an opt-in compatibility flag?
