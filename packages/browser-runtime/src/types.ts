export type WorkerInMessage =
  | { type: 'init'; wasmBytes?: ArrayBuffer; files: Record<string, string>; env?: Record<string, string>; sab?: SharedArrayBuffer }
  | { type: 'exec'; command: string; args: string[]; id: number }
  | { type: 'serve:request'; requestId: number; method: string; url: string; headers: Record<string, string>; body: Uint8Array | null }
  | { type: 'net:connected'; socketId: number }
  | { type: 'net:data'; socketId: number; data: Uint8Array }
  | { type: 'net:closed'; socketId: number }
  | { type: 'net:error'; socketId: number; message: string; code?: string }
  | { type: 'vfs:request'; requestId: number; filename: string; }
  | { type: 'vfs:dump'; id: number }
  | { type: 'vfs:restore'; id: number; snapshot: VfsSnapshot }
  | { type: 'fs:write'; path: string; content: string | Uint8Array }
  | { type: 'fs:mkdir'; path: string }
  | { type: 'fs:unlink'; path: string }
  | { type: 'fs:rename'; from: string; to: string }
  | { type: 'stdin'; data: Uint8Array }
  | { type: 'kill'; id: number }

export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'vfs:response'; requestId: number; status: number; headers: Record<string, string>; body: Uint8Array | null; stream: boolean }
  | { type: 'vfs:chunk'; requestId: number; chunk: Uint8Array }
  | { type: 'vfs:end'; requestId: number }
  | { type: 'vfs:error'; requestId: number; message: string }
  | { type: 'stdout'; data: Uint8Array }
  | { type: 'stderr'; data: Uint8Array }
  | { type: 'exit'; id: number; code: number }
  | { type: 'error'; message: string }
  | { type: 'vfs:create'; path: string; kind: 'file' | 'directory' }
  | { type: 'vfs:delete'; path: string; kind: 'file' | 'directory' }
  | { type: 'vfs:move'; from: string; to: string; kind: 'file' | 'directory' }
  | { type: 'serve:register'; name: string; port: number }
  | { type: 'serve:unregister'; name: string; port: number }
  | { type: 'serve:response'; requestId: number; status: number; headers: Record<string, string>; body: Uint8Array | null; stream: boolean }
  | { type: 'serve:chunk'; requestId: number; chunk: Uint8Array }
  | { type: 'serve:end'; requestId: number }
  | { type: 'serve:error'; requestId: number; message: string }
  | { type: 'net:connect'; socketId: number; host: string; port: number; tls: boolean }
  | { type: 'net:send'; socketId: number; data: Uint8Array }
  | { type: 'net:close'; socketId: number }
  | { type: 'net:error'; socketId: number }
  | { type: 'vfs:dump:result'; id: number; snapshot: VfsSnapshot }
  | { type: 'vfs:restore:result'; id: number }

export type VfsSnapshot = {
  files: Record<string, string>
  encoding: 'base64'
}


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
  wasmUrl?: string
  workerUrl?: string | URL
  crossOriginIsolated?: boolean
  env?: Record<string, string>
  allowedHosts?: string[]
}
