# Upstream Test Sources

This project references upstream test suites from official repositories. These are **not** vendored by default. Use the fetch script to obtain them locally.

## Sources
- Bun: https://github.com/oven-sh/bun
- Node.js: https://github.com/nodejs/node

## Fetch
Run:
- scripts/fetch-upstream-tests.sh

This will clone the upstream repositories into tests/upstream/.

## Notes
- Respect each upstream repository’s license and attribution requirements.
- These repos are large; use shallow clones by default.
- Tests are not executed automatically by this repo’s test runner.

## Module Coverage Map

This section lists **recommended upstream test scopes** by module. Use these as a starting point and refine based on the upstream repo’s current structure.

### Node.js (nodejs/node)

- http/https: test/parallel/test-http-*.js, test/parallel/test-https-*.js
- net/tls: test/parallel/test-net-*.js, test/parallel/test-tls-*.js
- stream: test/parallel/test-stream-*.js, test/parallel/test-readable-*.js, test/parallel/test-writable-*.js, test/parallel/test-transform-*.js
- process: test/parallel/test-process-*.js, test/parallel/test-env-*.js, test/parallel/test-hrtime-*.js
- perf_hooks: test/parallel/test-perf-hooks*.js
- worker_threads: test/parallel/test-worker-*.js, test/parallel/test-worker-threads-*.js, test/parallel/test-messagechannel*.js
- os: test/parallel/test-os-*.js
- buffer: test/parallel/test-buffer-*.js
- fs: test/parallel/test-fs-*.js, test/parallel/test-fs-promises-*.js
- zlib: test/parallel/test-zlib-*.js

### Bun (oven-sh/bun)

- bun API surface (general): test/bun, test/js
- http/https, net/tls, stream, process, perf_hooks, worker_threads, os, buffer, fs, zlib:
	start with test/js and test/bun, then filter by module name usage inside test files

> Note: Bun’s test layout evolves; verify paths after cloning and adjust the scope as needed.
