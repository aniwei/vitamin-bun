## Context
Bun.serve behavior in BunTS relies on Service Worker interception and worker dispatch.

## API Surface
- `Bun.serve({ fetch, port?, hostname?, tls? })`
- returns a handle with `stop()`

## Notes
- TLS is proxy-only; no raw TLS sockets in browser.
