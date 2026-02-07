## 1. Bun.serve API
- [ ] 1.1 Define Bun.serve options and handler registration
- [ ] 1.2 Implement request routing and response helpers
- [ ] 1.3 Implement streaming Response support

## 2. Service Worker bridge
- [ ] 2.1 Extend network-proxy SW to forward fetch to BunTS worker
- [ ] 2.2 Implement WebSocket relay (best-effort)
- [ ] 2.3 Add TLS proxy mode (https forwarding only)

## 3. SDK/runtime wiring
- [ ] 3.1 Expose Bun.serve from runtime/polyfill
- [ ] 3.2 Update worker message protocol for request/response

## 4. Examples
- [ ] 4.1 Add basic Bun.serve example
- [ ] 4.2 Add routes/headers example
- [ ] 4.3 Add streaming example
- [ ] 4.4 Add WebSocket example
- [ ] 4.5 Add TLS proxy example

## 5. Tests
- [ ] 5.1 Unit tests for routing and handler invocation
- [ ] 5.2 SW bridge tests (mocked)
