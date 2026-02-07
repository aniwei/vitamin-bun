import { describe, it, expect } from 'vitest'
import { VirtualFileSystem } from '../../../virtual-fs/src/index'
import { RuntimeCore } from '../runtime-core'

function collectOutput() {
  const stdout: Uint8Array[] = []
  const stderr: Uint8Array[] = []
  return {
    stdout,
    stderr,
    onStdout: (data: Uint8Array) => stdout.push(data),
    onStderr: (data: Uint8Array) => stderr.push(data),
  }
}

function decode(chunks: Uint8Array[]): string {
  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    merged.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(merged)
}

describe('Bun.spawn APIs', () => {
  it('runs spawn and spawnSync commands', async () => {
    const vfs = new VirtualFileSystem()
    vfs.writeFile(
      '/child.ts',
      "console.log('child out'); console.error('child err');",
    )
    vfs.writeFile(
      '/index.ts',
      `
        const proc = Bun.spawn({ cmd: ['bun', 'run', '/child.ts'] })
        const signal = new Int32Array(new SharedArrayBuffer(4))
        proc.exited.then((exit) => {
          console.log('spawn exit', exit)
          console.log('spawn stdout', new TextDecoder().decode(proc.stdout))
          console.log('spawn stderr', new TextDecoder().decode(proc.stderr))

          const sync = Bun.spawnSync({ cmd: ['bun', 'run', '/child.ts'] })
          console.log('sync exit', sync.exitCode)
          console.log('sync stdout', new TextDecoder().decode(sync.stdout))
          console.log('sync stderr', new TextDecoder().decode(sync.stderr))

          Atomics.store(signal, 0, 1)
          Atomics.notify(signal, 0, 1)
        })
        Atomics.wait(signal, 0, 0)
      `,
    )

    const output = collectOutput()
    const runtime = new RuntimeCore({
      vfs,
      onStdout: output.onStdout,
      onStderr: output.onStderr,
    })

    const exitCode = await runtime.exec('bun', ['run', '/index.ts'])
    expect(exitCode).toBe(0)

    const stdout = decode(output.stdout)
    const stderr = decode(output.stderr)

    expect(stdout).toContain('spawn exit 0')
    expect(stdout).toContain('spawn stdout child out')
    expect(stdout).toContain('spawn stderr child err')
    expect(stdout).toContain('sync exit 0')
    expect(stdout).toContain('sync stdout child out')
    expect(stdout).toContain('sync stderr child err')
    expect(stderr).toBe('')
  })
})
