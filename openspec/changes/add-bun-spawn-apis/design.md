# Design Notes

## Spawn APIs
- Use RuntimeCore `exec` for command execution.
- `spawnSync` should reuse async path but return a resolved result; document that it is not truly synchronous.
- Provide stdout/stderr as Uint8Array buffers.
- Support minimal options: `cmd`, `args`, and `env` overrides.
