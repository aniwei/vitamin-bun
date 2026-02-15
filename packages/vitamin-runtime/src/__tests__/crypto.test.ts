import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { createBunRuntime } from '../vitamin-runtime'
import { createCoreModules } from '../internal-modules/index'
import { ModuleLoader } from '../module-loader'
import { Transpiler } from '../transpiler'

function createLoader(vfs: VirtualFileSystem) {
  const polyfill = createBunRuntime(vfs, {}, () => {}, () => {})
  const coreModules = createCoreModules(vfs, polyfill)

  return new ModuleLoader({
    vfs,
    transpiler: new Transpiler(),
    runtime: { Bun: polyfill.Bun, process: polyfill.process, console: polyfill.console },
    coreModules,
  })
}

describe('Crypto module', () => {
  it('randomBytes returns correct length', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { randomBytes } = require('crypto')
      module.exports = randomBytes(16).length
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(16)
  })

  it('node:crypto alias works', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const crypto = require('node:crypto')
      module.exports = typeof crypto.randomBytes === 'function'
    `)

    const mod = await loader.load('/index')
    expect(mod.exports).toBe(true)
  })

  it('createHash sha256 digestAsync returns expected hex', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { createHash } = require('crypto')
      module.exports = createHash('sha256').update('hello').digestAsync('hex')
    `)

    const mod = await loader.load('/index')
    const digest = await (mod.exports as unknown as Promise<string>)
    expect(digest).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })

  it('createHmac sha256 digestAsync returns expected hex', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { createHmac } = require('crypto')
      module.exports = createHmac('sha256', 'key').update('hello').digestAsync('hex')
    `)

    const mod = await loader.load('/index')
    const digest = await (mod.exports as unknown as Promise<string>)
    expect(digest).toBe('9307b3b915efb5171ff14d8cb55fbcc798c6c0ef1456d66ded1a6aa723a58b7b')
  })

  it('pbkdf2 derives expected length', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { pbkdf2 } = require('crypto')
      module.exports = pbkdf2('password', 'salt', 10, 32, 'sha256')
        .then((buf) => buf.length)
    `)

    const mod = await loader.load('/index')
    const length = await (mod.exports as unknown as Promise<number>)
    expect(length).toBe(32)
  })

  it('randomUUID returns a UUID string', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index', `
      const { randomUUID } = require('crypto')
      module.exports = randomUUID()
    `)

    const mod = await loader.load('/index')
    const exported = mod.exports as unknown
    expect(typeof exported).toBe('string')
    if (typeof exported === 'string') {
      expect(exported.length).toBeGreaterThan(10)
    }
  })
})
