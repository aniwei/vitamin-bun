import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

export interface RuntimeEnv {
  env?: Record<string, string>
  cwd?: string
  argv?: string[]
}

export interface RuntimePolyfill {
  Bun: {
    env: Record<string, string>
    file: (path: string) => {
      text: () => Promise<string>
      json: () => Promise<unknown>
      arrayBuffer: () => Promise<ArrayBuffer>
    }
    write: (path: string, data: string | Uint8Array) => Promise<void>
  }
  process: {
    env: Record<string, string>
    argv: string[]
    cwd: () => string
    platform: string
    arch: string
    version: string
    versions: Record<string, string>
    stdout: { write: (data: string | Uint8Array) => void }
    stderr: { write: (data: string | Uint8Array) => void }
    nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => void
  }
  console: Console
}

export function createPolyfill(
  vfs: VirtualFileSystem,
  env: RuntimeEnv,
  onStdout: (data: Uint8Array) => void,
  onStderr: (data: Uint8Array) => void,
): RuntimePolyfill {
  const encoder = new TextEncoder()

  const stdout = {
    write(data: string | Uint8Array) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data
      onStdout(bytes)
    },
  }

  const stderr = {
    write(data: string | Uint8Array) {
      const bytes = typeof data === 'string' ? encoder.encode(data) : data
      onStderr(bytes)
    },
  }

  const bunEnv = { ...(env.env ?? {}) }

  const nextTickQueue: Array<() => void> = []
  let nextTickScheduled = false
  const scheduleNextTick = () => {
    if (nextTickScheduled) return
    nextTickScheduled = true
    const enqueue = typeof queueMicrotask === 'function'
      ? queueMicrotask
      : (cb: () => void) => Promise.resolve().then(cb)
    enqueue(() => {
      nextTickScheduled = false
      const tasks = nextTickQueue.splice(0)
      for (const task of tasks) {
        task()
      }
      if (nextTickQueue.length > 0) {
        scheduleNextTick()
      }
    })
  }

  return {
    Bun: {
      env: bunEnv,
      file(path: string) {
        return {
          async text() {
            return vfs.readFile(path)
          },
          async json() {
            const text = vfs.readFile(path)
            return JSON.parse(text)
          },
          async arrayBuffer() {
            const bytes = vfs.readFileBytes(path)
            return bytes.slice().buffer
          },
        }
      },
      async write(path: string, data: string | Uint8Array) {
        vfs.writeFile(path, data)
      },
    },
    process: {
      env: bunEnv,
      argv: env.argv ?? [],
      cwd: () => env.cwd ?? '/',
      platform: 'browser',
      arch: 'wasm',
      version: 'v0.0.0-bunts',
      versions: {
        bunts: '0.0.0',
      },
      stdout,
      stderr,
      nextTick: (callback: (...args: unknown[]) => void, ...args: unknown[]) => {
        nextTickQueue.push(() => callback(...args))
        scheduleNextTick()
      },
    },
    console: {
      log: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      info: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      warn: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      error: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      debug: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      trace: (...args: unknown[]) => stderr.write(args.join(' ') + '\n'),
      clear: () => {},
      dir: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      dirxml: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      assert: (condition?: boolean, ...args: unknown[]) => {
        if (!condition) stderr.write(args.join(' ') + '\n')
      },
      count: () => {},
      countReset: () => {},
      group: () => {},
      groupCollapsed: () => {},
      groupEnd: () => {},
      table: (...args: unknown[]) => stdout.write(args.join(' ') + '\n'),
      time: () => {},
      timeEnd: () => {},
      timeLog: () => {},
      timeStamp: () => {},
    },
  }
}
