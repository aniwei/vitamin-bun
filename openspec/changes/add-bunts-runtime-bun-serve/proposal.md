# Change: Add BunTS Bun.serve with Service Worker proxy

## Why
Browser runtime users need a Bun-compatible HTTP server API. A Service Worker bridge lets Bun.serve handle requests without raw sockets.

## What Changes
- Add Bun.serve implementation that registers handlers in BunTS runtime
- Add Service Worker bridge to forward requests to Bun.serve handlers
- Support advanced features: routes, headers, streaming, WebSocket, and TLS proxy mode
- Add/expand examples to cover Bun.serve features

## Impact
- Affected specs: `bunts-runtime-bun-serve`, `bunts-runtime-examples`
- Affected code: `packages/bunts-runtime`, `packages/network-proxy`, `packages/browser-runtime`, `packages/sdk`, `examples`
