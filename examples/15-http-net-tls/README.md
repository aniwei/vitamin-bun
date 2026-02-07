# Example 15 - HTTP client + net/tls

This demo runs HTTP requests and best-effort net/tls socket connections from inside the container.

## Run

```bash
pnpm install
cd examples/15-http-net-tls
npx vite
```

Click "Run" to execute the client script.

## Notes

- Uses Service Worker to enable localhost interception and net/tls proxying.
- Raw net/tls sockets are best-effort in the browser; results may vary by host.
