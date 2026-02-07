import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index.js'
import { createPolyfill } from '../polyfill.js'
import { createCoreModules } from '../core-modules.js'
import { ModuleLoader } from '../module-loader.js'
import { Transpiler } from '../transpiler.js'

function createLoader(vfs: VirtualFileSystem) {
  const polyfill = createPolyfill(vfs, {}, () => {}, () => {})
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

    vfs.writeFile('/index.js', `
      const { randomBytes } = require('crypto')
      module.exports = randomBytes(16).length
    `)

    const mod = await loader.load('/index.js')
    expect(mod.exports).toBe(16)
  })

  it('node:crypto alias works', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index.js', `
      const crypto = require('node:crypto')
      module.exports = typeof crypto.randomBytes === 'function'
    `)

    const mod = await loader.load('/index.js')
    expect(mod.exports).toBe(true)
  })

  it('createHash sha256 digestAsync returns expected hex', async () => {
    const vfs = new VirtualFileSystem()
    const loader = createLoader(vfs)

    vfs.writeFile('/index.js', `
      const { createHash } = require('crypto')
      module.exports = createHash('sha256').update('hello').digestAsync('hex')
    `)

    const mod = await loader.load('/index.js')
    const digest = await (mod.exports as unknown as Promise<string>)
    expect(digest).toBe('2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824')
  })
})
