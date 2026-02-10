import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'

describe('process module', () => {
  it('exposes platform/arch/version/versions', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})

    expect(polyfill.process.platform).toBe('browser')
    expect(polyfill.process.arch).toBe('wasm')
    expect(polyfill.process.version.startsWith('v')).toBe(true)
    expect(polyfill.process.versions.bunts).toBe('0.0.0')
  })

  it('supports env, cwd, and argv', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, { env: { FOO: 'bar' }, cwd: '/home', argv: ['bun', 'run'] }, () => {}, () => {})

    expect(polyfill.process.env.FOO).toBe('bar')
    expect(polyfill.process.cwd()).toBe('/home')
    polyfill.process.chdir('/tmp')
    expect(polyfill.process.cwd()).toBe('/tmp')
    expect(polyfill.process.argv).toEqual(['bun', 'run'])
  })

  it('provides hrtime and uptime', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})

    const [seconds, nanos] = polyfill.process.hrtime()
    expect(typeof seconds).toBe('number')
    expect(typeof nanos).toBe('number')
    expect(typeof polyfill.process.hrtime.bigint()).toBe('bigint')
    expect(polyfill.process.uptime()).toBeGreaterThanOrEqual(0)
  })

  it('emits exit and sets exitCode', () => {
    const vfs = new VirtualFileSystem()
    const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
    const codes: number[] = []

    polyfill.process.on('exit', (code) => {
      codes.push(code as number)
    })

    polyfill.process.exit(2)
    expect(polyfill.process.exitCode).toBe(2)
    expect(codes).toEqual([2])
  })
})
