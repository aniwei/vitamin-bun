import {
  type SABLayout,
  DEFAULT_SAB_LAYOUT,
  SABRequestType,
} from './types.js'

/**
 * SharedArrayBuffer-based bridge for synchronous I/O.
 *
 * WASI imports in the WASM module are synchronous, but browser I/O (fetch,
 * IndexedDB, etc.) is async. This bridge uses `Atomics.wait` / `Atomics.notify`
 * to block the worker thread while the main thread performs the async operation.
 *
 * ## Usage
 *
 * **Worker side** (inside the Web Worker running WASM):
 * ```ts
 * const result = bridge.requestSync(SABRequestType.FetchSync, payload)
 * ```
 *
 * **Main thread side**:
 * ```ts
 * bridge.onRequest(async (type, payload) => {
 *   const response = await doAsyncWork(type, payload)
 *   return response
 * })
 * ```
 */
export class SABBridge {
  readonly sab: SharedArrayBuffer
  readonly int32: Int32Array
  readonly uint8: Uint8Array
  private layout: SABLayout
  private handler:
    | ((type: SABRequestType, payload: Uint8Array) => Promise<Uint8Array>)
    | null = null

  constructor(layout: SABLayout = DEFAULT_SAB_LAYOUT) {
    this.layout = layout
    this.sab = new SharedArrayBuffer(layout.size)
    this.int32 = new Int32Array(this.sab)
    this.uint8 = new Uint8Array(this.sab)
  }

  /**
   * [Worker side] Send a synchronous request and block until the main thread
   * responds.
   */
  requestSync(type: SABRequestType, payload: Uint8Array): Uint8Array {
    const { int32, uint8, layout } = this

    // Write request type.
    Atomics.store(int32, layout.requestTypeOffset / 4, type)

    // Write payload length and data.
    Atomics.store(
      int32,
      layout.requestLenOffset / 4,
      payload.byteLength,
    )
    uint8.set(payload, layout.requestDataOffset)

    // Signal the main thread and wait for response.
    Atomics.store(int32, layout.lockOffset / 4, 1)
    Atomics.notify(int32, layout.lockOffset / 4)
    Atomics.wait(int32, layout.lockOffset / 4, 1)

    // Read response.
    const responseLen = Atomics.load(
      int32,
      layout.requestLenOffset / 4,
    )
    const responseStart = layout.requestDataOffset
    return uint8.slice(responseStart, responseStart + responseLen)
  }

  /**
   * [Main thread side] Register a handler that processes incoming requests.
   * This method polls the SAB for requests.
   */
  onRequest(
    handler: (
      type: SABRequestType,
      payload: Uint8Array,
    ) => Promise<Uint8Array>,
  ): void {
    this.handler = handler
    this.poll()
  }

  /** Stop listening for requests. */
  stopListening(): void {
    this.handler = null
  }

  private poll(): void {
    const { int32, uint8, layout } = this

    const check = () => {
      if (!this.handler) return

      const lock = Atomics.load(int32, layout.lockOffset / 4)
      if (lock === 1) {
        // A request is pending.
        const type = Atomics.load(
          int32,
          layout.requestTypeOffset / 4,
        ) as SABRequestType
        const payloadLen = Atomics.load(
          int32,
          layout.requestLenOffset / 4,
        )
        const payload = uint8.slice(
          layout.requestDataOffset,
          layout.requestDataOffset + payloadLen,
        )

        this.handler(type, payload)
          .then((response) => {
            // Write response.
            Atomics.store(
              int32,
              layout.requestLenOffset / 4,
              response.byteLength,
            )
            uint8.set(response, layout.requestDataOffset)

            // Signal the worker.
            Atomics.store(int32, layout.lockOffset / 4, 0)
            Atomics.notify(int32, layout.lockOffset / 4)
          })
          .catch(() => {
            // Signal error (empty response).
            Atomics.store(int32, layout.requestLenOffset / 4, 0)
            Atomics.store(int32, layout.lockOffset / 4, 0)
            Atomics.notify(int32, layout.lockOffset / 4)
          })
      }

      // Continue polling.
      if (this.handler !== null) {
        setTimeout(check, 1)
      }
    }

    check()
  }
}
