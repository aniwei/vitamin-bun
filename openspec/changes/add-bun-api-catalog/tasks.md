## 1. Catalog foundation
- [x] 1.1 Create Bun API catalog file with sections and status
- [x] 1.2 Map existing implemented APIs to catalog entries

## 2. Phase 1: Network + IO
- [x] 2.1 Define required Network + IO APIs and expected behaviors
- [x] 2.2 Implement missing APIs and document limitations
	- [x] 2.2.1 Add Bun.file bytes/delete helpers
	- [x] 2.2.2 Support Bun.write Response/Blob/ArrayBuffer inputs
	- [x] 2.2.3 Implement Bun.write Response streaming + FileSink
	- [x] 2.2.4 Implement BunFile.stream
	- [x] 2.2.5 Add fetch.preconnect warning stub
	- [x] 2.2.6 Support Bun.write ReadableStream input
- [x] 2.3 Add tests for Network + IO coverage (see docs/NETWORK_IO_TESTS.md)
	- [x] 2.3.1 Add fetch unsupported option warning tests
	- [x] 2.3.2 Add WS proxy behavior tests
	- [x] 2.3.3 Add net/tls proxy connect/write/end tests
	- [x] 2.3.4 Add http client request/get tests
	- [x] 2.3.5 Add http server subset tests
	- [x] 2.3.6 Add server lifecycle tests
	- [x] 2.3.7 Add BunFile.stream tests
	- [x] 2.3.8 Add fetch.preconnect warning test

## 3. Phase 2+: CLI and built-in modules
- [x] 3.1 Define CLI commands and built-in modules list
- [x] 3.2 Add compatibility notes and tests

## 4. Tracking and validation
- [x] 4.1 Add status checklist for implemented/partial/missing
- [x] 4.2 Add verification criteria per phase
