import { BootServiceFS } from '@vitamin-ai/browser-runtime'
import type { Readable } from './container'


export interface ContainerOptions {
  rootDir?: string
  wasmUrl?: string
  workerUrl?: string | URL
  serviceWorkerUrl?: string
  files?: Record<string, string>
  persistence?: 'memory' | 'indexeddb' | 'opfs'
  env?: Record<string, string>
  onServeStart?: (url: string) => void
  onVfsCreate?: (event: { path: string; kind: 'file' | 'directory' }) => void
  onVfsDelete?: (event: { path: string; kind: 'file' | 'directory' }) => void
  onVfsMove?: (event: { from: string; to: string; kind: 'file' | 'directory' }) => void
  allowedHosts?: string[]
}

export interface ExecResult {
  exitCode: number
  stdout: string
  stderr: string
}

export interface SpawnedProcess {
  pid: number
  stdout: Readable
  stderr: Readable
  writeStdin(data: string | Uint8Array): void
  kill(): void
  exited: Promise<number>
}

export interface ContainerFS extends BootServiceFS { }

export interface VfsSnapshot {
  files: Record<string, string>
  encoding: 'base64'
}

export interface Container {
  fs: ContainerFS
  exec(command: string, args?: string[]): Promise<ExecResult>
  spawn(command: string, args?: string[]): SpawnedProcess
  mount(path: string, files: Record<string, string>): Promise<void>
  dispose(): Promise<void>
}
