import type { BunRuntime } from '../vitamin-runtime'

type SqlJsInit = (config?: {
  locateFile?: (file: string) => string
  wasmBinary?: Uint8Array
}) => Promise<SqlJsStatic>

type SqlJsStatic = {
  Database: new (data?: Uint8Array) => SqlJsDatabase
}

type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>
  prepare: (sql: string) => SqlJsStatement
  close: () => void
}

type SqlJsStatement = {
  bind: (params?: Record<string, unknown> | unknown[]) => void
  step: () => boolean
  getAsObject: () => Record<string, unknown>
  free: () => void
}

type SqliteOpenOptions = {
  wasmUrl?: string
  wasmBinary?: Uint8Array
  filename?: string
}

let sqlInitPromise: Promise<SqlJsStatic> | null = null

export function createBunSqliteModule(runtime: BunRuntime): Record<string, unknown> {
  return {
    async open(filename: string | SqliteOpenOptions = ':memory:', options?: SqliteOpenOptions) {
      const resolved = resolveOpenOptions(filename, options)
      if (resolved.filename && resolved.filename !== ':memory:') {
        throw new Error('bun:sqlite only supports in-memory databases in browser runtime')
      }

      const SQL = await getSqlJs(runtime, resolved)
      const db = new SQL.Database()
      return createDatabase(db)
    },
    openSync(filename: string | SqliteOpenOptions = ':memory:', options?: SqliteOpenOptions) {
      const resolved = resolveOpenOptions(filename, options)
      if (resolved.filename && resolved.filename !== ':memory:') {
        throw new Error('bun:sqlite only supports in-memory databases in browser runtime')
      }
      const SQL = blockOnPromise(getSqlJs(runtime, resolved))
      const db = new SQL.Database()
      return createDatabase(db)
    },
    Database: createDatabase,
  }
}

function resolveOpenOptions(
  filename: string | SqliteOpenOptions,
  options?: SqliteOpenOptions,
): SqliteOpenOptions {
  if (typeof filename === 'string') {
    return { filename, ...options }
  }
  return filename
}

async function getSqlJs(runtime: BunRuntime, options?: SqliteOpenOptions): Promise<SqlJsStatic> {
  if (!sqlInitPromise) {
    sqlInitPromise = (async () => {
      const module = await import('sql.js')
      const initSqlJs = ((module as unknown) as { default?: SqlJsInit }).default
        ?? ((module as unknown) as SqlJsInit)
      const wasmUrl = options?.wasmUrl ?? runtime.process.env?.BUN_SQLITE_WASM_URL
      const config: Parameters<SqlJsInit>[0] = {}
      if (options?.wasmBinary) {
        config.wasmBinary = options.wasmBinary
      }

      const resolvedUrl = wasmUrl ?? (await resolveSqliteWasmPath())
      if (!config.wasmBinary && resolvedUrl && isFilePath(resolvedUrl)) {
        const binary = await readWasmBinary(resolvedUrl)
        if (binary) config.wasmBinary = binary
      }

      if (!config.wasmBinary) {
        if (resolvedUrl) {
          config.locateFile = () => resolvedUrl
        } else {
          throw new Error('bun:sqlite requires BUN_SQLITE_WASM_URL or wasmBinary')
        }
      }
      return await initSqlJs(config)
    })()
  }
  return await sqlInitPromise
}

async function resolveSqliteWasmPath(): Promise<string | null> {
  try {
    const { createRequire } = await import('module')
    const req = createRequire(import.meta.url)
    return req.resolve('sql.js/dist/sql-wasm.wasm')
  } catch {
    return null
  }
}

function isFilePath(value: string): boolean {
  return value.startsWith('/') || /^[A-Za-z]:[\/]/.test(value)
}

async function readWasmBinary(path: string): Promise<Uint8Array | null> {
  try {
    const fs = await import('fs')
    const buffer = await fs.promises.readFile(path)
    return new Uint8Array(buffer)
  } catch {
    return null
  }
}

function createDatabase(db: SqlJsDatabase) {
  return {
    exec(sql: string) {
      return db.exec(sql)
    },
    query(sql: string, params?: Record<string, unknown> | unknown[]) {
      const stmt = db.prepare(sql)
      if (params) stmt.bind(params)
      const rows: Record<string, unknown>[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
      return rows
    },
    close() {
      db.close()
    },
  }
}

function blockOnPromise<T>(promise: Promise<T>): T {
  if (!canBlock()) {
    throw new Error('bun:sqlite openSync requires Atomics.wait support')
  }
  const state = new Int32Array(new SharedArrayBuffer(4))
  let value: T | undefined
  let error: unknown
  promise
    .then((result) => {
      value = result
      Atomics.store(state, 0, 1)
      Atomics.notify(state, 0)
    })
    .catch((err) => {
      error = err
      Atomics.store(state, 0, 1)
      Atomics.notify(state, 0)
    })

  while (Atomics.load(state, 0) === 0) {
    Atomics.wait(state, 0, 0)
  }

  if (error) {
    throw error
  }
  return value as T
}

function canBlock(): boolean {
  return typeof SharedArrayBuffer === 'function' && typeof Atomics?.wait === 'function'
}
