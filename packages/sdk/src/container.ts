import invariant from 'invariant'
import { BootService } from '@vitamin-ai/browser-runtime'
import { ExitPayload, SimpleEmitter, StderrPayload, StdoutPayload, decoder } from '@vitamin-ai/shared'
import { 
  ServeRegisterPayload, 
  VfsCreatePayload, 
  VfsDeletePayload, 
  VfsMovePayload 
} from '@vitamin-ai/browser-runtime/src/types'
import type {
  ContainerOptions,
  ExecResult,
  SpawnedProcess,
  ContainerFS,
  Container,
} from './types'
import { CommandTask, MixinCommandTask } from './command'

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

class BootCommand extends SimpleEmitter {
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

  constructor(boot: BootService) {
    super()
    this.boot = boot
  }
} 

class VitaminContainer extends MixinCommandTask(BootCommand) implements Container {
  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []

    return this.execute(async (task: CommandTask) => {
      const onStdout = (stdout: unknown) => {
        const msg = stdout as StdoutPayload
        if (msg.data) stdoutChunks.push(msg.data)
      }

      const onStderr = (stderr: unknown) => {
        const msg = stderr as StderrPayload
        if (msg.data) stderrChunks.push(msg.data)
      }

      const onExit = (data: unknown) => {
        const msg = data as ExitPayload

        this.boot.off('stdout', onStdout as never)
        this.boot.off('stderr', onStderr as never)
        this.boot.off('exit', onExit as never)

        task.resolve({
          exitCode: msg.code ?? 1,
          stdout: decoder.decode(concat(stdoutChunks)),
          stderr: decoder.decode(concat(stderrChunks)),
        })
      }

      this.boot.on('stdout', onStdout)
      this.boot.on('stderr', onStderr)
      this.boot.on('exit', onExit)

      const pid = await this.boot.exec(command, args)
    })
  }

  async spawn(command: string, args: string[] = []): Promise<SpawnedProcess> {
    const pid = await this.boot.exec(command, args)
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
