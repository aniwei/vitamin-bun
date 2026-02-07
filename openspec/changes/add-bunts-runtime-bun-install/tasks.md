## 1. Installer core
- [x] 1.1 Parse `package.json` dependencies/devDependencies
- [x] 1.2 Resolve versions from npm registry metadata
- [x] 1.3 Download tarballs via fetch and extract into `/node_modules`
- [x] 1.4 Write minimal `package-lock` or `bun.lock` in VFS

## 2. Runtime integration
- [x] 2.1 Wire `bun install` command in RuntimeCore
- [x] 2.2 Surface progress/errors to stdout/stderr

## 3. Tests
- [x] 3.1 Registry resolution tests (mocked fetch)
- [x] 3.2 Tarball extraction tests
- [x] 3.3 `bun install` end-to-end test in VFS
