import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../core-modules/index'

describe('Core Modules', () => {
  it('path.join works', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const path = core.path as { join: (...parts: string[]) => string }
    expect(path.join('/a', 'b')).toBe('/a/b')
  })

  it('fs.readFileSync reads from VFS', () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/data.txt', 'hello')

    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const fs = core.fs as { readFileSync: (path: string, encoding?: string) => string | Uint8Array }
    const text = fs.readFileSync('/data.txt', 'utf-8')
    expect(text).toBe('hello')
  })

  it('buffer.from creates Uint8Array', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const core = createCoreModules(vfs, polyfill)

    const buffer = core.buffer as { Buffer: { from: (data: string) => Uint8Array } }
    const data = buffer.Buffer.from('hi')
    expect(data instanceof Uint8Array).toBe(true)
  })
})
