## 1. http/https client and server subset
- [ ] 1.1 Define request/response/agent surface and option mapping
- [ ] 1.2 Implement client request/get with redirects, timeout, and headers
- [ ] 1.3 Implement server createServer/Server/IncomingMessage/ServerResponse
- [ ] 1.4 Integrate server path with Bun.serve + SW bridge

## 2. net/tls socket proxy
- [ ] 2.1 Define socket event model and stream methods
- [ ] 2.2 Add SW proxy tunnel for net/tls (WS-based)
- [ ] 2.3 Implement net.connect/tls.connect and aliases

## 3. Compatibility and docs
- [x] 3.1 Add runtime warnings for unsupported options
- [x] 3.2 Update examples or docs for usage and limits

## 4. Tests
- [x] 4.1 Client request/get tests (http/https)
- [x] 4.2 Server subset tests (request/response)
- [x] 4.3 net/tls proxy tests (connect/write/end)
- [x] 4.4 WebSocket proxy behavior tests
