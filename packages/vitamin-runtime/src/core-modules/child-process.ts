import { createStreamModule } from './stream'

type ExecCallback = (error: Error | null, stdout: string, stderr: string) => void

type SpawnSyncResult = {
  pid: number
  output: Array<Uint8Array | null>
  stdout: Uint8Array
  stderr: Uint8Array
  status: number
  signal: string | null
  error?: Error
}

class SimpleEmitter {
  private listeners = new Map<string, Set<(...args: unknown[]) => void>>()

  on(event: string, listener: (...args: unknown[]) => void): this {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(listener)
    return this
  }

  emit(event: string, ...args: unknown[]): boolean {
    const set = this.listeners.get(event)
    if (!set || set.size === 0) return false
    for (const listener of Array.from(set)) {
      listener(...args)
    }
    return true
  }
}

class FakeChildProcess extends SimpleEmitter {
  pid = 0
  killed = false
  stdin: ReturnType<typeof createStreamModule>['Readable']
  stdout: ReturnType<typeof createStreamModule>['Readable']
  stderr: ReturnType<typeof createStreamModule>['Readable']

  constructor() {
    super()
    const streams = createStreamModule()
    this.stdin = new streams.Readable()
    this.stdout = new streams.Readable()
    this.stderr = new streams.Readable()
  }

  kill(): boolean {
    this.killed = true
    this.emit('close', 1)
    return true
  }
}

function makeUnsupportedError(command?: string): Error {
  const error = new Error('child_process is not supported in the browser runtime') as Error & {
    code?: string
    errno?: string
    syscall?: string
    path?: string
    spawnargs?: string[]
  }
  error.code = 'ERR_CHILD_PROCESS_UNSUPPORTED'
  error.errno = 'ENOSYS'
  error.syscall = 'spawn'
  if (command) {
    error.path = command
    error.spawnargs = [command]
  }
  return error
}

function toBytes(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

function schedule(fn: () => void): void {
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(fn)
  } else {
    Promise.resolve().then(fn)
  }
}

function spawn(command: string, _args: string[] = []): FakeChildProcess {
  const child = new FakeChildProcess()
  const error = makeUnsupportedError(command)
  schedule(() => {
    child.emit('error', error)
    child.emit('close', 1)
  })
  return child
}

function spawnSync(command: string, _args: string[] = []): SpawnSyncResult {
  const error = makeUnsupportedError(command)
  const stdout = new Uint8Array(0)
  const stderr = toBytes(error.message)
  return {
    pid: 0,
    output: [stdout, stderr],
    stdout,
    stderr,
    status: 1,
    signal: null,
    error,
  }
}

function exec(command: string, callback?: ExecCallback): FakeChildProcess {
  const child = spawn(command)
  if (callback) {
    const error = makeUnsupportedError(command)
    schedule(() => callback(error, '', error.message))
  }
  return child
}

function execSync(command: string): Uint8Array {
  const error = makeUnsupportedError(command)
  return toBytes(error.message)
}

function execFile(file: string, _args?: string[] | ExecCallback, maybeCallback?: ExecCallback): FakeChildProcess {
  const callback = typeof _args === 'function' ? _args : maybeCallback
  return exec(file, callback)
}

function execFileSync(file: string): Uint8Array {
  return execSync(file)
}

function fork(modulePath: string, _args: string[] = []): FakeChildProcess {
  return spawn(modulePath)
}

export function createChildProcessModule() {
  return {
    spawn,
    spawnSync,
    exec,
    execSync,
    execFile,
    execFileSync,
    fork,
  }
}
