import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index.js'
import { RuntimeCore } from '../runtime-core.js'

describe('module core module', () => {
  it('createRequire returns a function', () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('module')")
    vfs.writeFile('/dep.js', "module.exports = { ok: true }")

    const runtime = new RuntimeCore({ vfs })
    const requireFn = runtime.createRequire('/index.js')
    const dep = requireFn('/dep.js') as { ok?: boolean }
    expect(dep.ok).toBe(true)
  })

  it('resolves node:module alias', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.js', "module.exports = require('node:module')")

    const runtime = new RuntimeCore({ vfs })
    const code = await runtime.exec('bun', ['run', '/index.js'])
    expect(code).toBe(0)
  })
})
