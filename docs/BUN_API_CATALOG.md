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
| bun install | partial | Core: semver + integrity + lockfile + node_modules; workspaces/local links; peer/optional deps best-effort; lifecycle scripts disabled by default in browser. |
| bun build | partial | Routed with browser-safe error; bundler not implemented. |
| bun test | partial | Routed with browser-safe error; test runner not implemented. |
| bun update | partial | Routed with browser-safe error; updater not implemented. |
| bun create | partial | Routed with browser-safe error; scaffolding not implemented. |
| bun pm | partial | Routed with browser-safe error; package manager subcommands not implemented. |
| bunx | implemented | Resolves workspace bins, `.bin`, and package.json bin; supports `--package` and `--cwd`; auto-installs missing packages when possible; disable via `--no-install` or `BUNX_AUTO_INSTALL=false`. |

### Bun install parity milestones

- Core: registry metadata caching, semver resolution, tarball integrity checks, `node_modules` layout, lockfile updates.
- Workspaces: local links via workspace protocol and simple workspace globs.
- Scripts: lifecycle scripts are gated and disabled by default in browser runtimes.

### Browser vs Node constraints (bun install)

- Browser runtimes avoid executing arbitrary lifecycle scripts unless explicitly enabled.
- Install uses VFS-backed filesystem; no native symlinks or OS-level hooks.
- Integrity checks rely on WebCrypto availability.

## Built-in Modules (bun:*)

| Module | Status | Notes |
| --- | --- | --- |
| bun:sqlite | partial | WASM-backed via sql.js; in-memory only unless persistence is wired; requires wasm URL or binary. |
| bun:ffi | partial | Emits clear error in browser runtime; host/plugin support not wired. |
| bun:jsc | missing | Not applicable. |
| bun:transpiler | partial | Minimal `transpile()` surface backed by runtime transpiler. |
| bun:glob | implemented | Full glob syntax/options via minimatch; VFS-backed. |
| bun:semver | implemented | Full semver API surface via semver library. |

## Phase 2+ Compatibility Notes

- CLI commands are only available through RuntimeCore `exec`; only `bun run` and `bun install` are wired today.
- `bun install` scripts are gated (disabled by default) in browser runtimes; require explicit opt-in and a script runner.
- bun:* modules are placeholders; none are bundled in the browser runtime yet.

## Phase 2+ Test Coverage

- CLI command tests: partial (bunx coverage).
- bun:* module tests: partial (glob/semver/transpiler coverage).

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
