export type * from '@vitamin-ai/shared'
import type { VfsSnapshot } from '@vitamin-ai/shared'


export interface SABLayout {
  size: number
  lockOffset: number
  requestTypeOffset: number
  requestLenOffset: number
  requestDataOffset: number
  maxPayloadSize: number
}

export const DEFAULT_SAB_LAYOUT: SABLayout = {
  size: 1024 * 1024,
  lockOffset: 0,
  requestTypeOffset: 4,
  requestLenOffset: 8,
  requestDataOffset: 12,
  maxPayloadSize: 1024 * 1024 - 1024,
}

export enum SABRequestType {
  None = 0,
  FetchSync = 1,
  FSReadFile = 2,
  FSWriteFile = 3,
  FSMkdir = 4,
  FSReaddir = 5,
  FSUnlink = 6,
  FSStat = 7,
}

export interface RuntimeOptions {
  // wasmUrl?: string
  workerUrl?: string | URL
  crossOriginIsolated?: boolean
  env?: Record<string, string>
  allowedHosts?: string[]
}


export interface BootServiceFS {
  readFile(path: string, encoding?: string): Promise<string | Uint8Array>
  writeFile(path: string, content: string | Uint8Array): Promise<boolean>
  mkdir(path: string): Promise<boolean>
  readdir(path: string): Promise<string[]>
  unlink(path: string): Promise<boolean>
  rename(from: string, to: string): Promise<boolean>
  exists(path: string): Promise<boolean>
  save(): Promise<VfsSnapshot>
  restore(snapshot: VfsSnapshot): Promise<boolean>
}