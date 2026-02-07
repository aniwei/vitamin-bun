# Bun API Catalog

Status legend: implemented | partial | missing

## Runtime Global (Bun.*)

| API | Status | Notes |
| --- | --- | --- |
| Bun.serve | partial | Browser proxy bridge supported; TLS/WS limited by SW/WS constraints. |
| Bun.file | implemented | VFS-backed. |
| Bun.write | implemented | VFS-backed. |
| Bun.env | implemented | Environment variables from runtime. |
| Bun.plugin | implemented | Runtime plugin registration. |
| Bun.plugins | implemented | Registered plugin list. |
| Bun.spawn | missing | Use SDK spawn; runtime global not yet. |
| Bun.spawnSync | missing | Not available in browser runtime. |
| Bun.build | missing | Planned. |
| Bun.hash | missing | Planned. |
| Bun.sleep | missing | Planned. |
| Bun.which | missing | Planned. |

## Network + IO (Phase 1 priority)

| API | Status | Notes |
| --- | --- | --- |
| fetch | partial | Browser fetch available; Node-compatible options limited. |
| WebSocket | partial | SW cannot proxy native WebSocket; tunnel uses WS. |
| HTTP client (http/https) | partial | fetch-backed client; Agent limited. |
| HTTP server | partial | Bun.serve + SW interception. |
| net/tls sockets | partial | WS tunnel + SW fetch-stream proxy. |
| fs (core) | partial | VFS implemented; permissions/links partial. |
| fs/promises | partial | VFS-backed. |
| stream | partial | Core stream subset only. |

### Fetch extensions

| API | Status | Notes |
| --- | --- | --- |
| fetch proxy option | missing | Bun supports `proxy` option; browser does not (warns on use). |
| fetch tls options | missing | Bun supports `tls` options (cert/key/rejectUnauthorized); browser does not (warns on use). |
| fetch unix socket | missing | Bun supports `unix` option; browser does not (warns on use). |
| fetch protocol support | partial | `file:`/`data:`/`blob:` supported by browser; `s3:` not supported. |
| fetch streaming request body | partial | Browser `ReadableStream` supported; behavior differs from Bun. |
| fetch streaming response body | partial | Browser `ReadableStream` supported; behavior differs from Bun. |
| fetch.preconnect | missing | Bun-specific optimization not implemented. |

### Bun.serve server features

| API | Status | Notes |
| --- | --- | --- |
| routes option | missing | Bun routes not implemented; use `fetch`. |
| server.reload | partial | No-op in browser runtime. |
| server.stop | partial | `stop()` supported; force close semantics missing. |
| server.ref/unref | partial | No-op in browser runtime. |
| server.requestIP | missing | Not available in browser SW bridge. |
| server.timeout | missing | Not implemented. |
| websocket handler | partial | WS best-effort; SW cannot proxy native WS. |
| server metrics | missing | Not implemented. |

### File IO (Bun.file / Bun.write)

| API | Status | Notes |
| --- | --- | --- |
| Bun.file(path) | partial | VFS-backed; limited metadata and no real file descriptors. |
| BunFile.text/json/arrayBuffer/bytes | partial | VFS-backed. |
| BunFile.stream | partial | Streamed from VFS; backpressure semantics limited. |
| BunFile.exists | partial | VFS-backed. |
| BunFile.delete | partial | VFS-backed; missing file behavior follows VFS. |
| Bun.write(destination, data) | partial | VFS-backed; Response/Blob supported (streamed). |
| FileSink writer | partial | In-memory sink that flushes to VFS. |

### Network + IO test coverage

See [docs/NETWORK_IO_TESTS.md](docs/NETWORK_IO_TESTS.md) for the coverage map and gaps.

## CLI Commands

| Command | Status | Notes |
| --- | --- | --- |
| bun run | partial | Script execution via RuntimeCore. |
| bun install | partial | registry/tarball support; lockfile basic. |
| bun build | missing | Planned. |
| bun test | missing | Planned. |
| bun update | missing | Planned. |
| bun create | missing | Planned. |

## Built-in Modules (bun:*)

| Module | Status | Notes |
| --- | --- | --- |
| bun:sqlite | missing | Planned; may require plugin hook. |
| bun:ffi | missing | Not supported in browser. |
| bun:jsc | missing | Not applicable. |
| bun:transpiler | missing | Planned. |

## Node Compatibility (core modules)

| Module | Status | Notes |
| --- | --- | --- |
| assert | implemented | Core module.
| buffer | implemented | Core module.
| crypto | partial | Limited WebCrypto mapping.
| events | implemented | Core module.
| fs | partial | VFS-backed.
| http/https | partial | fetch-backed.
| net/tls | partial | WS tunnel.
| path | implemented | Core module.
| process | partial | Browser runtime values.
| stream | partial | Subset.
| timers | implemented | Core module.
| url | implemented | Core module.
| worker_threads | partial | WebWorker-backed.

## Catalog Notes
- This catalog is phased; Phase 1 focuses on Network + IO.
- Browser constraints apply; missing APIs include unsupported native features.
