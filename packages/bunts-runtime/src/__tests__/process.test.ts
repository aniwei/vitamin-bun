import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../bun-runtime'

describe('process module', () => {
  it('exposes platform/arch/version/versions', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})

    expect(polyfill.process.platform).toBe('browser')
    expect(polyfill.process.arch).toBe('wasm')
    expect(polyfill.process.version.startsWith('v')).toBe(true)
    expect(polyfill.process.versions.bunts).toBe('0.0.0')
  })
})
