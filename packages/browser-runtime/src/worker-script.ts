import { RuntimeCore } from '@vitamin-ai/vitamin-runtime'
import { VirtualFileSystem, InodeKind } from '@vitamin-ai/virtual-fs'
import { installFetchWarnings } from './fetch-warnings'

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

interface NetConnectedMessage {
  type: 'net:connected'
  socketId: number
}

interface NetDataMessage {
  type: 'net:data'
  socketId: number
  data: Uint8Array
}

interface NetClosedMessage {
  type: 'net:closed'
  socketId: number
}

interface NetErrorMessage {
  type: 'net:error'
  socketId: number
  message: string
  code?: string
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
  | NetConnectedMessage
  | NetDataMessage
  | NetClosedMessage
  | NetErrorMessage
  | VfsDumpMessage
  | VfsRestoreMessage
  | FsWriteMessage
  | FsMkdirMessage
  | FsUnlinkMessage
  | StdinMessage
  | KillMessage

let runtime: RuntimeCore | null = null
let vfs: VirtualFileSystem | null = null

let stdinBuffer: Uint8Array[] = []
let netProxy: NetProxyBridge | null = null

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

async function handleInit(msg: InitMessage): Promise<void> {
  try {
    vfs = new VirtualFileSystem({
      onCreate: (event) => post({ type: 'vfs:create', path: event.path, kind: event.kind }),
      onDelete: (event) => post({ type: 'vfs:delete', path: event.path, kind: event.kind }),
      onMove: (event) => post({ type: 'vfs:move', from: event.from, to: event.to, kind: event.kind }),
    })

    for (const [path, content] of Object.entries(msg.files ?? {})) {
      seedFile(vfs, path, content)
    }

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

    installFetchWarnings()

    netProxy = createNetProxyBridge()
    ;(globalThis as { __vitaminNetProxy?: NetProxyBridge }).__vitaminNetProxy = netProxy

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

function handleFsRename(msg: { type: 'fs:rename'; from: string; to: string }): void {
  if (!vfs) return
  vfs.rename(msg.from, msg.to)
}

function handleNetMessage(msg: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage): void {
  if (!netProxy) return
  netProxy.handleMessage(msg)
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
    case 'fs:rename':
      handleFsRename(msg)
      break
    case 'net:connected':
    case 'net:data':
    case 'net:closed':
    case 'net:error':
      handleNetMessage(msg)
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

type NetProxyBridge = {
  open: (host: string, port: number, tls: boolean) => number
  send: (socketId: number, data: Uint8Array) => void
  close: (socketId: number) => void
  on: (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => void
  off: (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => void
  handleMessage: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void
}

function createNetProxyBridge(): NetProxyBridge {
  const hasServiceWorker =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    Boolean(navigator.serviceWorker.controller)

  if (hasServiceWorker && typeof ReadableStream === 'function') {
    return createSwNetProxyBridge()
  }

  return createDirectNetProxyBridge()
}

function createDirectNetProxyBridge(): NetProxyBridge {
  let socketCounter = 0
  const listeners = new Map<number, Set<(event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void>>()

  const open = (host: string, port: number, tls: boolean) => {
    const socketId = ++socketCounter
    post({ type: 'net:connect', socketId, host, port, tls })
    return socketId
  }

  const send = (socketId: number, data: Uint8Array) => {
    post({ type: 'net:send', socketId, data })
  }

  const close = (socketId: number) => {
    post({ type: 'net:close', socketId })
  }

  const on = (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => {
    if (!listeners.has(socketId)) listeners.set(socketId, new Set())
    listeners.get(socketId)!.add(handler)
  }

  const off = (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => {
    listeners.get(socketId)?.delete(handler)
  }

  const handleMessage = (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => {
    const set = listeners.get(event.socketId)
    if (!set) return
    for (const listener of Array.from(set)) {
      listener(event)
    }
  }

  return { open, send, close, on, off, handleMessage }
}

function createSwNetProxyBridge(): NetProxyBridge {
  let socketCounter = 0
  const listeners = new Map<number, Set<(event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void>>()
  const controllers = new Map<number, ReadableStreamDefaultController<Uint8Array>>()
  const abortControllers = new Map<number, AbortController>()

  const emit = (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => {
    const set = listeners.get(event.socketId)
    if (!set) return
    for (const listener of Array.from(set)) {
      listener(event)
    }
  }

  const open = (host: string, port: number, tls: boolean) => {
    const socketId = ++socketCounter
    const url = new URL('/@/vitamin_net_proxy', location.origin)
    url.searchParams.set('host', host)
    url.searchParams.set('port', String(port))
    url.searchParams.set('tls', tls ? '1' : '0')

    const abortController = new AbortController()
    abortControllers.set(socketId, abortController)

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controllers.set(socketId, controller)
      },
    })

    void fetch(url.toString(), {
      method: 'POST',
      body: stream,
      signal: abortController.signal,
      duplex: 'half',
    } as RequestInit)
      .then(async (response) => {
        if (!response.ok) {
          const code = response.headers.get('x-vitamin-error-code') ?? mapStatusToCode(response.status)
          emit({ type: 'net:error', socketId, message: `Proxy error: ${response.status}`, code })
          emit({ type: 'net:closed', socketId })
          return
        }

        emit({ type: 'net:connected', socketId })

        const reader = response.body?.getReader()
        if (!reader) {
          emit({ type: 'net:closed', socketId })
          return
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value) emit({ type: 'net:data', socketId, data: value })
        }
        emit({ type: 'net:closed', socketId })
      })
      .catch((err) => {
        emit({ type: 'net:error', socketId, message: String(err), code: 'ECONNREFUSED' })
        emit({ type: 'net:closed', socketId })
      })

    return socketId
  }

  const send = (socketId: number, data: Uint8Array) => {
    const controller = controllers.get(socketId)
    if (!controller) return
    controller.enqueue(data)
  }

  const close = (socketId: number) => {
    const controller = controllers.get(socketId)
    controller?.close()
    controllers.delete(socketId)
    abortControllers.get(socketId)?.abort()
    abortControllers.delete(socketId)
  }

  const on = (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => {
    if (!listeners.has(socketId)) listeners.set(socketId, new Set())
    listeners.get(socketId)!.add(handler)
  }

  const off = (socketId: number, handler: (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => void) => {
    listeners.get(socketId)?.delete(handler)
  }

  const handleMessage = (event: NetConnectedMessage | NetDataMessage | NetClosedMessage | NetErrorMessage) => {
    emit(event)
  }

  return { open, send, close, on, off, handleMessage }
}

function mapStatusToCode(status: number): string {
  if (status === 403) return 'EACCES'
  if (status === 400) return 'EINVAL'
  if (status === 503) return 'EHOSTUNREACH'
  return 'ECONNREFUSED'
}
