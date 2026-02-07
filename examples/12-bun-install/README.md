# Example 12 - Bun Install (Proxy)

This demo runs `bun install` in the browser and proxies npm registry traffic through the local Vite dev server to avoid CORS issues.

## Run

```bash
pnpm install
cd examples/12-bun-install
npx vite
```

## Notes

- The example uses `BUN_INSTALL_REGISTRY` pointing at `/npm` which is proxied in [examples/vite.config.ts](../vite.config.ts).
- The proxy forwards to `https://registry.npmjs.org`.
