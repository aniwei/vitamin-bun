import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  // Resolve @vitamin-ai/* to local source for live dev
  resolve: {
    alias: {
      '@vitamin-ai/sdk': resolve(__dirname, '../packages/sdk/src'),
      '@vitamin-ai/wasm-host': resolve(__dirname, '../packages/wasm-host/src'),
      '@vitamin-ai/virtual-fs': resolve(__dirname, '../packages/virtual-fs/src'),
      '@vitamin-ai/bunts-runtime': resolve(__dirname, '../packages/bunts-runtime/src'),
      '@vitamin-ai/browser-runtime': resolve(__dirname, '../packages/browser-runtime/src'),
      '@vitamin-ai/network-proxy': resolve(__dirname, '../packages/network-proxy/src'),
    },
  },

  server: {
    // Required for SharedArrayBuffer (cross-origin isolation)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    proxy: {
      '/npm': {
        target: 'https://registry.npmjs.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/npm/, ''),
      },
    },
  },
})
