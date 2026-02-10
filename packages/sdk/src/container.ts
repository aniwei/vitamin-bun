import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import { Runner } from '@vitamin-ai/browser-runtime'
import { HttpProxy, WebSocketProxy } from '@vitamin-ai/network-proxy'
import type {
  ContainerOptions,
  ExecResult,
  SpawnedProcess,
  ContainerFS,
  Container,
  VfsSnapshot,
} from './types'

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
  private runner: Runner
  private vfs: VirtualFileSystem

  readonly fs: ContainerFS

  constructor(
    runner: Runner,
    vfs: VirtualFileSystem,
  ) {
    this.runner = runner
    this.vfs = vfs

    this.fs = {
      readFile: async (
        path: string,
        encoding?: string,
      ): Promise<string | Uint8Array> => {
        if (encoding === 'utf8' || encoding === 'utf-8') {
          return this.vfs.readFile(path)
        }
        return this.vfs.readFileBytes(path)
      },
      writeFile: async (
        path: string,
        content: string | Uint8Array,
      ): Promise<void> => {
        this.vfs.writeFile(path, content)
        this.runner.writeFile(path, content)
      },
      mkdir: async (path: string): Promise<void> => {
        this.vfs.mkdirp(path)
        this.runner.mkdir(path)
      },
      readdir: async (path: string): Promise<string[]> => {
        return this.vfs.readdir(path).map((e) => e.name)
      },
      unlink: async (path: string): Promise<void> => {
        this.vfs.unlink(path)
        this.runner.unlink(path)
      },
      rename: async (from: string, to: string): Promise<void> => {
        this.vfs.rename(from, to)
        this.runner.rename(from, to)
      },
      exists: async (path: string): Promise<boolean> => {
        return this.vfs.exists(path)
      },
      save: async (): Promise<VfsSnapshot> => {
        const snapshot = (await this.runner.dumpVfs()) as VfsSnapshot
        return snapshot
      },
      restore: async (snapshot: VfsSnapshot): Promise<void> => {
        await this.runner.restoreVfs(snapshot)
        for (const [path, encoded] of Object.entries(snapshot.files)) {
          const bytes = base64ToBytes(encoded)
          this.vfs.writeFile(path, bytes)
          this.runner.writeFile(path, bytes)
        }
      },
    }
  }

  async exec(command: string, args: string[] = []): Promise<ExecResult> {
    const stdoutChunks: Uint8Array[] = []
    const stderrChunks: Uint8Array[] = []

    const id = this.runner.exec(command, args)

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
          this.runner.off('stdout', onStdout as never)
          this.runner.off('stderr', onStderr as never)
          this.runner.off('exit', onExit as never)

          resolve({
            exitCode: msg.code ?? 1,
            stdout: decoder.decode(concat(stdoutChunks)),
            stderr: decoder.decode(concat(stderrChunks)),
          })
        }
      }

      this.runner.on('stdout', onStdout as never)
      this.runner.on('stderr', onStderr as never)
      this.runner.on('exit', onExit as never)
    })
  }

  spawn(command: string, args: string[] = []): SpawnedProcess {
    const id = this.runner.exec(command, args)
    const stdout = new Readable()
    const stderr = new Readable()

    let exitResolve: (code: number) => void
    const exited = new Promise<number>((resolve) => {
      exitResolve = resolve
    })

    this.runner.on('stdout', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stdout.push(msg.data)
    }) as never)

    this.runner.on('stderr', ((msg: { type: string; data?: Uint8Array }) => {
      if (msg.data) stderr.push(msg.data)
    }) as never)

    this.runner.on('exit', ((msg: {
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
        this.runner.sendStdin(bytes)
      },
      kill: () => this.runner.kill(id),
      exited,
    }
  }

  async mount(
    path: string,
    files: Record<string, string>,
  ): Promise<void> {
    this.vfs.mkdirp(path)

    for (const [name, content] of Object.entries(files)) {
      const fullPath = path.endsWith('/')
        ? `${path}${name}`
        : `${path}/${name}`
      
      const parts = fullPath.split('/')
      parts.pop()
      if (parts.length > 0) {
        this.vfs.mkdirp(parts.join('/'))
      }
      this.vfs.writeFile(fullPath, content)
    }
  }

  async dispose(): Promise<void> {
    this.runner.dispose()
  }
}

export async function createVitaminContainer(
  options: ContainerOptions,
): Promise<Container> {
  const vfs = new VirtualFileSystem()
  const initialFiles = withSourceMapUrls(options.files ?? {}, options.rootDir)

  if (Object.keys(initialFiles).length > 0) {
    for (const [path, content] of Object.entries(initialFiles)) {
      const parts = path.split('/')
      parts.pop()
      if (parts.length > 0) {
        vfs.mkdirp(parts.join('/'))
      }
      vfs.writeFile(path, content)
    }
  }

  if (options.serviceWorkerUrl && 'serviceWorker' in navigator) {
    try {
      await navigator.serviceWorker.register(options.serviceWorkerUrl, {
        scope: '/',
        type: 'module',
      })
      await navigator.serviceWorker.ready
    } catch {
      console.warn('[vitamin] Service Worker registration failed')
    }
  }

  const runner = new Runner(`aaa`, {
    wasmUrl: options.wasmUrl,
    workerUrl: options.workerUrl,
    crossOriginIsolated: globalThis.crossOriginIsolated ?? false,
    env: options.env,
    allowedHosts: options.allowedHosts,
  })

  await runner.boot(initialFiles)

  if (options.onVfsCreate || options.onVfsDelete || options.onVfsMove) {
    runner.on('vfs:create', (msg) => {
      if (msg.type !== 'vfs:create') return
      options.onVfsCreate?.({ path: msg.path, kind: msg.kind })
    })
    runner.on('vfs:delete', (msg) => {
      if (msg.type !== 'vfs:delete') return
      options.onVfsDelete?.({ path: msg.path, kind: msg.kind })
    })
    runner.on('vfs:move', (msg) => {
      if (msg.type !== 'vfs:move') return
      options.onVfsMove?.({ from: msg.from, to: msg.to, kind: msg.kind })
    })
  }

  if (options.onServeStart) {
    runner.on('serve:register', (msg) => {
      if (msg.type !== 'serve:register') return

      const origin = typeof location !== 'undefined' ? location.origin : 'http://localhost'
      const url = `${origin}/@/${msg.name}${msg.port}`
      options.onServeStart?.(url)
    })
  }

  return new VitaminContainer(runner, vfs)
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

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

function withSourceMapUrls(
  files: Record<string, string>,
  rootDir?: string,
): Record<string, string> {
  const normalizedRoot = normalizeRootDir(rootDir ?? 'root')
  const result: Record<string, string> = {}

  for (const [path, content] of Object.entries(files)) {
    const fileName = path.split('/').filter(Boolean).pop() ?? 'index.ts'
    result[path] = appendSourceMapUrl(content, normalizedRoot, fileName)
  }
  return result
}

function appendSourceMapUrl(content: string, rootDir: string, fileName: string): string {
  if (!shouldAppendSourceMap(fileName)) return content
  if (content.includes('sourceMappingURL=')) return content

  const suffix = `//# sourceMappingURL=@vitamin-ai/${rootDir}/${fileName}`
  
  if (content.endsWith('\n')) return content + suffix + '\n'
  return content + '\n' + suffix + '\n'
}

function shouldAppendSourceMap(fileName: string): boolean {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return false
  
  return lower.endsWith('.ts')
    || lower.endsWith('.tsx')
    || lower.endsWith('.js')
    || lower.endsWith('.jsx')
    || lower.endsWith('.mjs')
    || lower.endsWith('.cjs')
}

function normalizeRootDir(rootDir: string): string {
  return rootDir.split('/').filter(Boolean).join('/') || 'root'
}
