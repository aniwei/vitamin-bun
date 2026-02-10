import React from 'react'
import { WasmHost, WasiShim, JSContextBridge } from '@vitamin-ai/wasm-host'
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example06LowLevelApi() {
  return (
    <ExampleRunner
      tag="Example 06"
      title="Low-Level API"
      description="Use WasmHost and WASI shim directly."
      run={async ({ log }) => {
        log('=== Low-Level WASM Host Demo ===')
        const vfs = new VirtualFileSystem()
        vfs.mkdirp('/home/user')
        vfs.writeFile('/home/user/data.json', JSON.stringify({ key: 'value' }))
        log('✅ VFS initialized with /home/user/data.json')

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
          preopens: { '/': '/', '/home': '/home' },
          heapSize: 128_000_000,
          onStdout(data: Uint8Array) {
            stdoutChunks.push(new TextDecoder().decode(data))
          },
          onStderr(data: Uint8Array) {
            stderrChunks.push(new TextDecoder().decode(data))
          },
        })

        try {
          await host.load()
          log('✅ WASM module loaded')
        } catch (err) {
          log(`❌ Failed to load WASM: ${String(err)}`)
          return
        }

        try {
          const exitCode = await host.start()
          log(`Execution finished (exit code: ${exitCode})`)
          log(`stdout: ${stdoutChunks.join('')}`)
          if (stderrChunks.length > 0) {
            log(`stderr: ${stderrChunks.join('')}`)
          }
        } catch (err) {
          log(`❌ Runtime error: ${String(err)}`)
        }

        const bridge = host.jsContextBridge
        log(`JS Context Bridge: ${bridge.liveHandleCount} live handles`)

        log('\n=== Standalone WASI Shim Demo ===')
        const shim = new WasiShim({
          wasmUrl: '/fake.wasm',
          vfs,
          env: { GREETING: 'hi' },
          args: ['test-app'],
          preopens: { '/': '/' },
        })
        const imports = shim.getImports()
        const wasiFns = Object.keys(imports.wasi_snapshot_preview1).sort()
        log(`WASI import functions: ${wasiFns.slice(0, 6).join(', ')}...`)

        log('\n=== JS Context Bridge Demo ===')
        const jsBridge = new JSContextBridge()
        const h1 = jsBridge.js_context_create_object()
        const h2 = jsBridge.js_context_create_object()
        log(`Created 2 objects: handles ${h1}, ${h2}`)
        jsBridge.js_context_release(h1)
        log(`Released handle ${h1}`)
        log(`Live dynamic handles: ${jsBridge.liveHandleCount}`)
      }}
    />
  )
}
