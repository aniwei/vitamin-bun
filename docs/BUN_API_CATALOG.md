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
| Bun.spawn | partial | RuntimeCore-backed; no real OS processes, stdout/stderr buffered. |
| Bun.spawnSync | partial | Runs via synchronous module load; best-effort only. |
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
| fetch.preconnect | missing | Bun-specific optimization not implemented (warns on use). |

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
| Bun.write(destination, data) | partial | VFS-backed; Response/Blob/ReadableStream supported (streamed). |
| FileSink writer | partial | In-memory sink with append/highWaterMark support. |

### Network + IO test coverage

See [docs/NETWORK_IO_TESTS.md](docs/NETWORK_IO_TESTS.md) for the coverage map and gaps.

## Verification Criteria

### Phase 1 (Network + IO)
- All Network + IO tests pass (`bunts-runtime`, `browser-runtime`, `network-proxy`).
- Coverage map updated in [docs/NETWORK_IO_TESTS.md](docs/NETWORK_IO_TESTS.md).
- Catalog entries updated for implemented/partial/missing status.

### Phase 2+ (CLI + built-ins)
- CLI/built-in module list defined with status and notes.
- Compatibility notes and tests documented for new modules.

## Status Checklist

- Implemented entries reviewed and accurate.
- Partial entries list concrete limitations.
- Missing entries have a short note or plan.

## CLI Commands

| Command | Status | Notes |
| --- | --- | --- |
| bun run | partial | Script execution via RuntimeCore; limited flags. |
| bun install | partial | Registry/tarball support; lockfile basic. |
| bun build | missing | Planned; no bundler in browser runtime. |
| bun test | missing | Planned; no test runner yet. |
| bun update | missing | Planned. |
| bun create | missing | Planned. |
| bun pm | missing | Planned; no package manager subcommands. |
| bunx | missing | Planned; not wired in RuntimeCore. |

## Built-in Modules (bun:*)

| Module | Status | Notes |
| --- | --- | --- |
| bun:sqlite | missing | Planned; may require plugin hook. |
| bun:ffi | missing | Not supported in browser. |
| bun:jsc | missing | Not applicable. |
| bun:transpiler | missing | Planned. |
| bun:glob | missing | Planned; VFS-backed implementation. |
| bun:semver | missing | Planned; likely JS implementation. |

## Phase 2+ Compatibility Notes

- CLI commands are only available through RuntimeCore `exec`; only `bun run` and `bun install` are wired today.
- bun:* modules are placeholders; none are bundled in the browser runtime yet.

## Phase 2+ Test Coverage

- CLI command tests: missing.
- bun:* module tests: missing.

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
