/**
 * Example 06 — Low-Level WASM Host API
 *
 * Demonstrates using @vitamin-ai/wasm-host directly (without the SDK)
 * for advanced use cases: custom WASI shim, direct WASM module control,
 * and JS Context Bridge.
 */
import { WasmHost, WasiShim, WasmLoader, JSContextBridge } from '@vitamin-ai/wasm-host'
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

async function main() {
  console.log('=== Low-Level WASM Host Demo ===\n')

  // ── 1. Set up VFS ──────────────────────────────────────────

  const vfs = new VirtualFileSystem()
  vfs.mkdirp('/home/user')
  vfs.writeFile('/home/user/data.json', JSON.stringify({ key: 'value' }))
  console.log('✅ VFS initialized with /home/user/data.json')

  // ── 2. Create WasmHost with custom config ──────────────────

  const stdoutChunks: string[] = []
  const stderrChunks: string[] = []

  const host = new WasmHost({
    wasmUrl: '/bun-core.wasm',
    vfs,
    env: {
      HOME: '/home/user',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      LANG: 'en_US.UTF-8',
      CUSTOM_VAR: 'hello-from-host',
    },
    args: ['bun', 'run', '/home/user/main.ts'],
    preopens: {
      '/': '/',
      '/home': '/home',
    },
    heapSize: 128_000_000, // 128 MB heap
    onStdout(data: Uint8Array) {
      stdoutChunks.push(new TextDecoder().decode(data))
    },
    onStderr(data: Uint8Array) {
      stderrChunks.push(new TextDecoder().decode(data))
    },
  })

  console.log('✅ WasmHost configured')
  console.log(`   VFS has ${vfs.readdir('/home/user').length} file(s) in /home/user`)

  // ── 3. Load the WASM module ────────────────────────────────

  try {
    await host.load()
    console.log('✅ WASM module loaded')
    console.log(`   Memory: ${host.memory ? host.memory.buffer.byteLength / 1024 / 1024 : 0} MB`)
  } catch (err) {
    console.error('❌ Failed to load WASM:', err)
    return
  }

  // ── 4. Run the module ──────────────────────────────────────

  try {
    const exitCode = await host.start()
    console.log(`\n✅ Execution finished (exit code: ${exitCode})`)
    console.log('stdout:', stdoutChunks.join(''))
    if (stderrChunks.length > 0) {
      console.log('stderr:', stderrChunks.join(''))
    }
  } catch (err) {
    console.error('❌ Runtime error:', err)
  }

  // ── 5. Inspect JS Context Bridge state ─────────────────────

  const bridge = host.jsContextBridge
  console.log(`\nJS Context Bridge: ${bridge.liveHandleCount} live handles`)
}

// ── Standalone WASI shim demo ──────────────────────────────────

async function wasiShimDemo() {
  console.log('\n=== Standalone WASI Shim Demo ===\n')

  const vfs = new VirtualFileSystem()
  vfs.writeFile('/test.txt', 'Hello from WASI shim!')

  const shim = new WasiShim({
    wasmUrl: '/fake.wasm',
    vfs,
    env: { GREETING: 'hi' },
    args: ['test-app'],
    preopens: { '/': '/' },
  })

  // The shim can be used with any WASM module that expects WASI imports
  const imports = shim.getImports()
  console.log('WASI import functions:')
  console.log(
    Object.keys(imports.wasi_snapshot_preview1)
      .sort()
      .map((fn) => `  • ${fn}`)
      .join('\n')
  )
}

// ── JS Context Bridge standalone demo ──────────────────────────

function jsContextDemo() {
  console.log('\n=== JS Context Bridge Demo ===\n')

  const bridge = new JSContextBridge()

  // The bridge needs WASM memory for string operations, but we can
  // demonstrate handle management without it:
  console.log('Pre-allocated handles:')
  console.log('  handle 0 → undefined')
  console.log('  handle 1 → null')
  console.log('  handle 2 → true')
  console.log('  handle 3 → false')
  console.log('  handle 4 → globalThis')
  console.log(`\nLive dynamic handles: ${bridge.liveHandleCount}`)

  // Create some objects
  const h1 = bridge.js_context_create_object()
  const h2 = bridge.js_context_create_object()
  console.log(`Created 2 objects: handles ${h1}, ${h2}`)
  console.log(`Live dynamic handles: ${bridge.liveHandleCount}`)

  // Release one
  bridge.js_context_release(h1)
  console.log(`Released handle ${h1}`)
  console.log(`Live dynamic handles: ${bridge.liveHandleCount}`)
}

// Run all demos
main()
  .then(wasiShimDemo)
  .then(jsContextDemo)
  .catch(console.error)
