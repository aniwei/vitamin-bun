## 1. Installer core
- [ ] 1.1 Parse `package.json` dependencies/devDependencies
- [ ] 1.2 Resolve versions from npm registry metadata
- [ ] 1.3 Download tarballs via fetch and extract into `/node_modules`
- [ ] 1.4 Write minimal `package-lock` or `bun.lock` in VFS

## 2. Runtime integration
- [ ] 2.1 Wire `bun install` command in RuntimeCore
- [ ] 2.2 Surface progress/errors to stdout/stderr

## 3. Tests
- [ ] 3.1 Registry resolution tests (mocked fetch)
- [ ] 3.2 Tarball extraction tests
- [ ] 3.3 `bun install` end-to-end test in VFS
