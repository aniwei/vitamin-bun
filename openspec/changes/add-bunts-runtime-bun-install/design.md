## Context
Browser runtime needs a package installer with limited scope. We must avoid Node-native APIs and rely on fetch + VFS.

## Goals / Non-Goals
- Goals:
  - Install dependencies declared in `package.json`
  - Use fetch to download npm tarballs
  - Write to VFS `/node_modules`
- Non-Goals:
  - Lifecycle scripts (preinstall/postinstall)
  - Native addons
  - Optional peer dependency resolution beyond warnings

## Decisions
- Decision: Use npm registry metadata + tarball fetch, with a small subset of semver (exact versions and caret/tilde fallback).
- Decision: Keep installer in BunTS runtime to avoid adding a separate service.

## Risks / Trade-offs
- Large dependency trees can be slow in the browser
- Semver coverage is intentionally limited

## Migration Plan
- None (new functionality only)

## Open Questions
- Should we cache downloaded tarballs in IndexedDB?
- How strict should integrity checks be?
