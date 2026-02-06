/**
 * Type definitions for the public SDK.
 */

import type { Readable } from './container.js'

/** Options passed to `createBunContainer()`. */
export interface ContainerOptions {
  /** URL to the Bun WASM binary (`.wasm` file). */
  wasmUrl: string
  /**
   * Initial files to populate the virtual filesystem.
   * Keys are file paths, values are file content strings.
   */
  files?: Record<string, string>
  /**
   * Persistence backend for the virtual filesystem.
   * - `'memory'` — no persistence (default)
   * - `'indexeddb'` — persist to IndexedDB
   * - `'opfs'` — persist to Origin Private File System
   */
  persistence?: 'memory' | 'indexeddb' | 'opfs'
  /** Environment variables available to the Bun process. */
  env?: Record<string, string>
}

/** Result of running a command to completion. */
export interface ExecResult {
  /** Exit code of the process (0 = success). */
  exitCode: number
  /** Captured stdout output. */
  stdout: string
  /** Captured stderr output. */
  stderr: string
}

/** A running process with streaming I/O. */
export interface SpawnedProcess {
  /** Process ID. */
  pid: number
  /** Readable stream of stdout data. */
  stdout: Readable
  /** Readable stream of stderr data. */
  stderr: Readable
  /** Write data to stdin. */
  writeStdin(data: string | Uint8Array): void
  /** Kill the process. */
  kill(): void
  /** Promise that resolves when the process exits. */
  exited: Promise<number>
}

/** Simplified filesystem API exposed by the container. */
export interface ContainerFS {
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>
  writeFile(path: string, content: string | Uint8Array): Promise<void>
  mkdir(path: string): Promise<void>
  readdir(path: string): Promise<string[]>
  unlink(path: string): Promise<void>
  exists(path: string): Promise<boolean>
}

/** The main BunContainer interface. */
export interface BunContainer {
  /** Filesystem access. */
  fs: ContainerFS
  /** Run a command and wait for it to complete. */
  exec(command: string, args?: string[]): Promise<ExecResult>
  /** Spawn a long-running process with streaming I/O. */
  spawn(command: string, args?: string[]): SpawnedProcess
  /** Mount additional files into the virtual filesystem. */
  mount(path: string, files: Record<string, string>): Promise<void>
  /** Tear down the container and release all resources. */
  destroy(): Promise<void>
}
