# Network + IO Test Coverage

This document maps Network + IO APIs to current tests and highlights gaps.

## Coverage Map

| Area | APIs | Tests | Status |
| --- | --- | --- | --- |
| Bun.serve | Bun.serve basic/dispatch/404/stop/lifecycle | packages/bunts-runtime/src/__tests__/bun-serve.test.ts | partial |
| HTTP client | http.get/request, redirects | packages/bunts-runtime/src/__tests__/http.test.ts, packages/bunts-runtime/src/__tests__/http-net-compat.test.ts | partial |
| HTTP server subset | createServer/IncomingMessage/ServerResponse | packages/bunts-runtime/src/__tests__/http-net-compat.test.ts | partial |
| net/tls sockets | connect/write/end, proxy errors | packages/bunts-runtime/src/__tests__/net.test.ts | partial |
| fetch | unsupported options warnings | packages/browser-runtime/src/__tests__/fetch-warnings.test.ts | partial |
| WebSocket | WS proxy behavior | packages/network-proxy/src/__tests__/websocket-proxy.test.ts | partial |
| Bun.file | text/json/arrayBuffer/bytes/delete | packages/bunts-runtime/src/__tests__/bun-file-write.test.ts | partial |
| Bun.write | string/bytes/Response/Blob/stream | packages/bunts-runtime/src/__tests__/bun-file-write.test.ts | partial |

## Gaps (Phase 1)

1. Add tests for server lifecycle methods (reload/ref/unref when implemented).
