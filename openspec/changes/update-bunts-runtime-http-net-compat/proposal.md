# Change: Expand BunTS http/https/net compatibility

## Why
Many dependencies expect Node-style `http`/`https`/`net`/`tls`. Minimal stubs are not enough for real-world usage in browser containers.

## What Changes
- Expand `http`/`https` client APIs to cover common Node patterns (request/get, Agent, keep-alive, redirects, timeouts).
- Add a browser-safe `http`/`https` server subset that integrates with Bun.serve and the SW bridge.
- Provide `net`/`tls` sockets backed by a Service Worker proxy (WebSocket tunnel), with Node-like events and stream methods.
- Emit runtime warnings for unsupported options and Node-only behaviors.
- Document browser limitations clearly.

## Impact
- Affected specs: `bunts-runtime-http`, `bunts-runtime-net`
- Affected code: `packages/bunts-runtime/src/core-modules/*`, `packages/browser-runtime/src/*`, `packages/network-proxy/src/*`, `packages/sdk/src/*`
