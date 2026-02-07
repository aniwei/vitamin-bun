import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'

describe('module core module', () => {
  it('createRequire returns a function', () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('module')")
    vfs.writeFile('/dep', "module.exports = { ok: true }")

    const runtime = new RuntimeCore({ vfs })
    const requireFn = runtime.createRequire('/index')
    const dep = requireFn('/dep') as { ok?: boolean }
    expect(dep.ok).toBe(true)
  })

  it('resolves node:module alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index', "module.exports = require('node:module')")

    const runtime = new RuntimeCore({ vfs })
    const code = await runtime.exec('bun', ['run', '/index'])
    expect(code).toBe(0)
  })
})
