## Context
BunTS needs a browser-friendly installer. This spec documents required behaviors and limitations.

## Goals / Non-Goals
- Goals:
  - Fetch npm metadata/tarballs
  - Install into VFS
  - Emit install errors
- Non-Goals:
  - Run lifecycle scripts
  - Build native addons

## Data Model
- `package.json` dependencies
- Minimal lockfile format

## Error Handling
- Non-zero exit code on failure
- stderr reports failing package
