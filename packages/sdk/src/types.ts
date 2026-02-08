/**
 * Type definitions for the public SDK.
 */

import type { Readable } from './container'

/** Options passed to `createBunContainer()`. */
export interface ContainerOptions {
  /** Root name used in sourceMappingURL for initial files. */
  rootDir?: string

  /** URL to the Bun WASM binary (`.wasm` file). Optional for BunTS runtime. */
  wasmUrl?: string
  /**
   * URL to the worker script (module worker).
   * If not provided, browser-runtime will attempt to use a default path.
   */
  workerUrl?: string | URL
  /**
   * URL to the Service Worker script for intercepting localhost fetch requests.
   * If provided, the SDK will register the Service Worker automatically.
   */
  serviceWorkerUrl?: string
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
  /** Callback when a Bun.serve server starts. */
  onServeStart?: (url: string) => void
  /** Callback when a file is created in the VFS. */
  onVfsCreate?: (event: { path: string; kind: 'file' | 'directory' }) => void
  /** Callback when a file is deleted in the VFS. */
  onVfsDelete?: (event: { path: string; kind: 'file' | 'directory' }) => void
  /** Callback when a file or directory is moved in the VFS. */
  onVfsMove?: (event: { from: string; to: string; kind: 'file' | 'directory' }) => void
  /**
   * Hostnames that the container is allowed to make network requests to.
   * If omitted, all hosts are allowed.
   */
  allowedHosts?: string[]
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
  rename(from: string, to: string): Promise<void>
  exists(path: string): Promise<boolean>
  save(): Promise<VfsSnapshot>
  restore(snapshot: VfsSnapshot): Promise<void>
}

export interface VfsSnapshot {
  files: Record<string, string>
  encoding: 'base64'
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
