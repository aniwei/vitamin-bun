/**
 * Type definitions for the browser runtime layer.
 */

/** Messages sent from the main thread to the WASM worker. */
export type WorkerInMessage =
  | { type: 'init'; wasmBytes?: ArrayBuffer; files: Record<string, string>; env?: Record<string, string>; sab?: SharedArrayBuffer }
  | { type: 'exec'; command: string; args: string[]; id: number }
  | { type: 'serve:request'; requestId: number; method: string; url: string; headers: Record<string, string>; body: Uint8Array | null }
  | { type: 'vfs:dump'; id: number }
  | { type: 'vfs:restore'; id: number; snapshot: VfsSnapshot }
  | { type: 'fs:write'; path: string; content: string | Uint8Array }
  | { type: 'fs:mkdir'; path: string }
  | { type: 'fs:unlink'; path: string }
  | { type: 'stdin'; data: Uint8Array }
  | { type: 'kill'; id: number }

/** Messages sent from the WASM worker back to the main thread. */
export type WorkerOutMessage =
  | { type: 'ready' }
  | { type: 'stdout'; data: Uint8Array }
  | { type: 'stderr'; data: Uint8Array }
  | { type: 'exit'; id: number; code: number }
  | { type: 'error'; message: string }
  | { type: 'serve:register'; port: number }
  | { type: 'serve:unregister'; port: number }
  | { type: 'serve:response'; requestId: number; status: number; headers: Record<string, string>; body: Uint8Array | null; stream: boolean }
  | { type: 'serve:chunk'; requestId: number; chunk: Uint8Array }
  | { type: 'serve:end'; requestId: number }
  | { type: 'serve:error'; requestId: number; message: string }
  | { type: 'vfs:dump:result'; id: number; snapshot: VfsSnapshot }
  | { type: 'vfs:restore:result'; id: number }

export type VfsSnapshot = {
  files: Record<string, string>
  encoding: 'base64'
}

/**
 * SharedArrayBuffer layout for synchronous I/O bridging.
 *
 * The WASM worker writes a request into the SAB, then calls `Atomics.wait`.
 * The main thread reads the request, performs the async operation (e.g. fetch),
 * writes the result back, and calls `Atomics.notify`.
 *
 * Layout (byte offsets):
 *   [0..3]   — lock / signal word (Int32)
 *   [4..7]   — request type (Int32)
 *   [8..11]  — request payload length (Int32)
 *   [12..N]  — request payload (variable)
 *   [N..N+3] — response status (Int32)
 *   [N+4..M] — response payload (variable)
 */
export interface SABLayout {
  /** Total size of the SharedArrayBuffer. */
  size: number
  /** Offset of the lock word. */
  lockOffset: number
  /** Offset of the request type field. */
  requestTypeOffset: number
  /** Offset of the request payload length field. */
  requestLenOffset: number
  /** Offset of the request payload. */
  requestDataOffset: number
  /** Maximum payload size. */
  maxPayloadSize: number
}

/** Default SAB layout with 1 MB buffer. */
export const DEFAULT_SAB_LAYOUT: SABLayout = {
  size: 1024 * 1024,
  lockOffset: 0,
  requestTypeOffset: 4,
  requestLenOffset: 8,
  requestDataOffset: 12,
  maxPayloadSize: 1024 * 1024 - 1024,
}

/** Request types for SAB-based synchronous I/O. */
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

/** Runtime configuration. */
export interface RuntimeOptions {
  /** URL to the Bun WASM binary (optional for BunTS). */
  wasmUrl?: string

  /**
   * URL to the worker script (module worker).
   * If not provided, falls back to `new URL('./worker-script.js', import.meta.url)`.
   * Bundlers like Vite / Webpack 5 / esbuild will resolve this automatically.
   */
  workerUrl?: string | URL

  /** Whether SharedArrayBuffer is available (requires COOP/COEP headers). */
  crossOriginIsolated?: boolean

  /** Environment variables forwarded into the WASM runtime. */
  env?: Record<string, string>
}
