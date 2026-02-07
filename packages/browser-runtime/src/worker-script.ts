/**
 * Worker entry point — runs inside a dedicated Web Worker.
 *
 * This module receives initial filesystem contents from the main thread,
 * sets up the BunTS runtime (pure TypeScript + VFS), and executes commands
 * inside the worker context.
 *
 * **Important**: This file must be bundled as a module worker
 * (`new Worker(url, { type: 'module' })`).
 */

import { RuntimeCore } from '@vitamin-ai/bunts-runtime'
import { VirtualFileSystem, InodeKind } from '@vitamin-ai/virtual-fs'

// eslint-disable-next-line no-restricted-globals
declare const self: DedicatedWorkerGlobalScope

interface InitMessage {
  type: 'init'
  wasmBytes?: ArrayBuffer
  files: Record<string, string>
  env?: Record<string, string>
  sab?: SharedArrayBuffer
}

interface ExecMessage {
  type: 'exec'
  command: string
  args: string[]
  id: number
}

interface ServeRequestMessage {
  type: 'serve:request'
  requestId: number
  method: string
  url: string
  headers: Record<string, string>
  body: Uint8Array | null
}

interface FsWriteMessage {
  type: 'fs:write'
  path: string
  content: string | Uint8Array
}

interface VfsDumpMessage {
  type: 'vfs:dump'
  id: number
}

interface VfsRestoreMessage {
  type: 'vfs:restore'
  id: number
  snapshot: { files: Record<string, string>; encoding: 'base64' }
}

interface FsMkdirMessage {
  type: 'fs:mkdir'
  path: string
}

interface FsUnlinkMessage {
  type: 'fs:unlink'
  path: string
}

interface StdinMessage {
  type: 'stdin'
  data: Uint8Array
}

interface KillMessage {
  type: 'kill'
  id: number
}

type IncomingMessage =
  | InitMessage
  | ExecMessage
  | ServeRequestMessage
  | VfsDumpMessage
  | VfsRestoreMessage
  | FsWriteMessage
  | FsMkdirMessage
  | FsUnlinkMessage
  | StdinMessage
  | KillMessage

// ─── Runtime State ──────────────────────────────────────────────

let runtime: RuntimeCore | null = null
let vfs: VirtualFileSystem | null = null

/** Pending stdin buffer — consumed by WASI fd_read on fd 0 */
let stdinBuffer: Uint8Array[] = []

// ─── Helpers ────────────────────────────────────────────────────

function post(msg: unknown): void {
  self.postMessage(msg)
}

function postError(message: string): void {
  post({ type: 'error', message })
}

/**
 * Ensure all parent directories for `filePath` exist in the VFS,
 * then write the file.
 */
function seedFile(fs: VirtualFileSystem, filePath: string, content: string | Uint8Array): void {
  const lastSlash = filePath.lastIndexOf('/')
  if (lastSlash > 0) {
    fs.mkdirp(filePath.substring(0, lastSlash))
  }
  fs.writeFile(filePath, content)
}

// ─── Message Handlers ───────────────────────────────────────────

async function handleInit(msg: InitMessage): Promise<void> {
  try {
    // 1. Create VFS and seed initial files
    vfs = new VirtualFileSystem()

    for (const [path, content] of Object.entries(msg.files ?? {})) {
      seedFile(vfs, path, content)
    }

    // 2. Configure BunTS runtime core (pure TypeScript)
    runtime = new RuntimeCore({
      vfs,
      env: {
        HOME: '/',
        PATH: '/usr/local/bin:/usr/bin:/bin',
        TERM: 'xterm-256color',
        ...(msg.env ?? {}),
      },
      onStdout(data: Uint8Array) {
        post({ type: 'stdout', data })
      },
      onStderr(data: Uint8Array) {
        post({ type: 'stderr', data })
      },
      onServeRegister(port: number) {
        post({ type: 'serve:register', port })
      },
      onServeUnregister(port: number) {
        post({ type: 'serve:unregister', port })
      },
    })

    post({ type: 'ready' })
  } catch (err) {
    postError(`Init failed: ${err instanceof Error ? err.message : String(err)}`)
  }
}

async function handleExec(msg: ExecMessage): Promise<void> {
  if (!runtime) {
    postError('Cannot exec: runtime not initialised')
    post({ type: 'exit', id: msg.id, code: 1 })
    return
  }

  try {
    const exitCode = await runtime.exec(msg.command, msg.args)
    post({ type: 'exit', id: msg.id, code: exitCode })
  } catch (err) {
    postError(`Exec failed: ${err instanceof Error ? err.message : String(err)}`)
    post({ type: 'exit', id: msg.id, code: 1 })
  }
}

function handleStdin(msg: StdinMessage): void {
  stdinBuffer.push(msg.data)
}

function handleKill(msg: KillMessage): void {
  // TODO: Once we support multi-process, terminate the specific process.
  // For now just acknowledge the kill.
  post({ type: 'exit', id: msg.id, code: 137 })
}

function handleFsWrite(msg: FsWriteMessage): void {
  if (!vfs) return
  seedFile(vfs, msg.path, msg.content)
}

function handleFsMkdir(msg: FsMkdirMessage): void {
  if (!vfs) return
  vfs.mkdirp(msg.path)
}

function handleFsUnlink(msg: FsUnlinkMessage): void {
  if (!vfs) return
  if (vfs.exists(msg.path)) vfs.unlink(msg.path)
}

function handleVfsDump(msg: VfsDumpMessage): void {
  if (!vfs) return
  const files: Record<string, string> = {}
  walkVfs(vfs, '/', files)
  post({ type: 'vfs:dump:result', id: msg.id, snapshot: { files, encoding: 'base64' } })
}

function handleVfsRestore(msg: VfsRestoreMessage): void {
  if (!vfs) return
  const files = msg.snapshot.files
  for (const [path, encoded] of Object.entries(files)) {
    seedFile(vfs, path, base64ToBytes(encoded))
  }
  post({ type: 'vfs:restore:result', id: msg.id })
}

async function handleServeRequest(msg: ServeRequestMessage): Promise<void> {
  if (!runtime) return
  try {
    const body = msg.body ? msg.body.slice().buffer as ArrayBuffer : undefined
    const request = new Request(msg.url, {
      method: msg.method,
      headers: msg.headers,
      body,
    })
    const response = await runtime.dispatchServeRequest(request)
    await postServeResponse(msg.requestId, response)
  } catch (err) {
    post({ type: 'serve:error', requestId: msg.requestId, message: String(err) })
  }
}

async function postServeResponse(requestId: number, response: Response): Promise<void> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })

  if (!response.body) {
    post({ type: 'serve:response', requestId, status: response.status, headers, body: null, stream: false })
    return
  }

  const reader = response.body.getReader()
  post({ type: 'serve:response', requestId, status: response.status, headers, body: null, stream: true })

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    if (value) {
      post({ type: 'serve:chunk', requestId, chunk: value })
    }
  }

  post({ type: 'serve:end', requestId })
}

// ─── Main Message Loop ──────────────────────────────────────────

self.onmessage = async (event: MessageEvent<IncomingMessage>) => {
  const msg = event.data

  switch (msg.type) {
    case 'init':
      await handleInit(msg)
      break
    case 'exec':
      await handleExec(msg)
      break
    case 'stdin':
      handleStdin(msg)
      break
    case 'kill':
      handleKill(msg)
      break
    case 'serve:request':
      await handleServeRequest(msg)
      break
    case 'fs:write':
      handleFsWrite(msg)
      break
    case 'fs:mkdir':
      handleFsMkdir(msg)
      break
    case 'fs:unlink':
      handleFsUnlink(msg)
      break
    case 'vfs:dump':
      handleVfsDump(msg)
      break
    case 'vfs:restore':
      handleVfsRestore(msg)
      break
    default:
      postError(`Unknown message type: ${(msg as { type: string }).type}`)
  }
}

function walkVfs(fs: VirtualFileSystem, dir: string, out: Record<string, string>): void {
  const entries = fs.readdir(dir)
  for (const entry of entries) {
    const next = dir === '/' ? `/${entry.name}` : `${dir}/${entry.name}`
    if (entry.kind === InodeKind.Directory) {
      walkVfs(fs, next, out)
    } else if (entry.kind === InodeKind.File) {
      out[next] = bytesToBase64(fs.readFileBytes(next))
    }
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToBytes(encoded: string): Uint8Array {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}
