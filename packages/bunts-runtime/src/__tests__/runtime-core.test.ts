import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'

describe('RuntimeCore', () => {
  it('executes a simple entry file', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile('/index.ts', `
      console.log('hello')
      export const ok = true
    `)

    const stdout: Uint8Array[] = []
    const runtime = new RuntimeCore({
      vfs,
      onStdout: (data) => stdout.push(data),
    })

    const code = await runtime.exec('bun', ['run', '/index.ts'])
    expect(code).toBe(0)

    const text = new TextDecoder().decode(concat(stdout))
    expect(text).toContain('hello')
  })
})

function concat(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((sum, b) => sum + b.byteLength, 0)
  const out = new Uint8Array(total)
  let offset = 0
  for (const b of buffers) {
    out.set(b, offset)
    offset += b.byteLength
  }
  return out
}
