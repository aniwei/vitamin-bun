# Example 14 - Hono Server with Bun.serve

This demo installs Hono inside the container and mounts it on Bun.serve.

## Run

```bash
pnpm install
cd examples/14-hono-server
npx vite
```

Click "Run" to install dependencies, start the server, and fetch routes.

## Notes

- Uses `BUN_INSTALL_REGISTRY` pointing at `/npm` which is proxied in [examples/vite.config.ts](../vite.config.ts).
- Service Worker is required to proxy `http://localhost` back to the container.
