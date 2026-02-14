import invariant from 'invariant'
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { BootService, MessagePayload } from '@vitamin-ai/browser-runtime'
import { base64ToBytes, bytesToBase64 } from '@vitamin-ai/shared'
import type {
  ContainerOptions,
  ExecResult,
  SpawnedProcess,
  ContainerFS,
  Container,
  VfsSnapshot,
} from './types'
import { ServeRegisterPayload, VfsCreatePayload, VfsDeletePayload, VfsMovePayload } from '@vitamin-ai/browser-runtime/src/types'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export class Readable {
  private listeners = new Set<(data: Uint8Array) => void>()

  on(_event: 'data', handler: (data: Uint8Array) => void): void {
    this.listeners.add(handler)
  }

  off(_event: 'data', handler: (data: Uint8Array) => void): void {
    this.listeners.delete(handler)
  }

  push(data: Uint8Array): void {
    for (const listener of this.listeners) {
      listener(data)
    }
  }
}

class VitaminContainer implements Container {
  #boot: BootService | null = null
  get boot() {
    invariant(this.#boot, 'Boot service is not initialized')
    return this.#boot
  }
  set boot(boot: BootService) {
    if (this.#boot) {
      this.#boot.dispose()
    }

    boot.on('error', (msg) => console.error(msg))

    this.#boot = boot
  }

  get fs(): ContainerFS {
    invariant(this.boot, 'WorkerBoot is not initialized')
    return this.boot
  }

  constructor(
    boot: BootService
  ) {
    this.boot = boot
  }

  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []

    const id = this.boot.exec(command, args)

    return new Promise<ExecResult>((resolve) => {
      const onStdout = (msg: { type: string; data?: Uint8Array }) => {
        if (msg.type === 'stdout' && msg.data) {
          stdoutChunks.push(msg.data)
        }
      }
      const onStderr = (msg: { type: string; data?: Uint8Array }) => {
        if (msg.type === 'stderr' && msg.data) {
          stderrChunks.push(msg.data)
        }
      }
      const onExit = (msg: { type: string; id?: number; code?: number }) => {
        if (msg.type === 'exit' && msg.id === id) {
          this.boot.off('stdout', onStdout as never)
          this.boot.off('stderr', onStderr as never)
          this.boot.off('exit', onExit as never)

          resolve({
            exitCode: msg.code ?? 1,
            stdout: decoder.decode(concat(stdoutChunks)),
            stderr: decoder.decode(concat(stderrChunks)),
          })
        }
      }

      this.boot.on('stdout', onStdout as never)
      this.boot.on('stderr', onStderr as never)
      this.boot.on('exit', onExit as never)
    })
  }

  spawn(command: string, args: string[] = []): SpawnedProcess {
    const id = this.boot.exec(command, args)
    const stdout = new Readable()
    const stderr = new Readable()

    let exitResolve: (code: number) => void
    const exited = new Promise<number>((resolve) => {
      exitResolve = resolve
    })

    this.boot.on('stdout', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stdout.push(msg.data)
    }) as never)

    this.boot.on('stderr', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stderr.push(msg.data)
    }) as never)

    this.boot.on('exit', ((msg: {
      type: string
      id?: number
      code?: number
    }) => {
      if (msg.id === id) exitResolve(msg.code ?? 1)
    }) as never)

    return {
      pid: id,
      stdout,
      stderr,
      writeStdin: (data: string | Uint8Array) => {
        const bytes =
          typeof data === 'string' ? encoder.encode(data) : data
        this.boot.stdin(bytes)
      },
      kill: () => this.boot.kill(id),
      exited,
    }
  }

  async mount(
    path: string,
    files: Record<string, string>,
  ): Promise<void> {
    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.endsWith('/')
        ? `${path}${name}`
        : `${path}/${name}`
      
      const parts = fullPath.split('/')
      parts.pop()
      if (parts.length > 0) {
        await this.fs.mkdirp(parts.join('/'))
      }

      await this.fs.writeFile(fullPath, content)
    }
  }

  async dispose(): Promise<void> {
    this.boot.dispose()
  }
}

export async function createVitaminContainer(
  options: ContainerOptions,
): Promise<Container> {
  const { files, serviceWorkerUrl } = options

  if (serviceWorkerUrl && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(serviceWorkerUrl, {
        scope: '/',
        type: 'module',
      })

      await navigator.serviceWorker.ready
    } catch {
      console.warn('Service Worker registration failed')
    }
  }

  const { allowedHosts, workerUrl, env } = options

  const boot = new BootService(`Add`, {
    workerUrl,
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
    env,
    allowedHosts
  })


  await boot.start(files)

  const { onVfsCreate, onVfsDelete, onVfsMove, onServeStart } = options

  if (onVfsCreate || onVfsDelete || onVfsMove) {
    boot.on('vfs:create', (data: unknown) => {
      const msg = data as VfsCreatePayload
      onVfsCreate?.({ path: msg.path, kind: msg.kind })
    })

    boot.on('vfs:delete', (data: unknown) => {
      const msg = data as VfsDeletePayload
      onVfsDelete?.({ path: msg.path, kind: msg.kind })
    })

    boot.on('vfs:move', (data: unknown) => {
      const msg = data as VfsMovePayload
      onVfsMove?.({ from: msg.from, to: msg.to, kind: msg.kind })
    })
  }

  if (onServeStart) {
    boot.on('serve:register', (data: unknown) => {
      const msg = data as ServeRegisterPayload
      const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost'
      const url = `${origin}/@/${msg.name}${msg.port}`
      onServeStart?.(url)
    })
  }

  return new VitaminContainer(boot)
}

function concat(buffers: Uint8Array[]): Uint8Array {
  const total = buffers.reduce((s, b) => s + b.byteLength, 0)
  const result = new Uint8Array(total)
  let offset = 0

  for (const buf of buffers) {
    result.set(buf, offset)
    offset += buf.byteLength
  }

  return result
}
