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
import { VirtualFileSystem } from '@vitamin-ai/virtual-fs'

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

interface StdinMessage {
  type: 'stdin'
  data: Uint8Array
}

interface KillMessage {
  type: 'kill'
  id: number
}

type IncomingMessage = InitMessage | ExecMessage | StdinMessage | KillMessage

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
function seedFile(fs: VirtualFileSystem, filePath: string, content: string): void {
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
    default:
      postError(`Unknown message type: ${(msg as { type: string }).type}`)
  }
}
