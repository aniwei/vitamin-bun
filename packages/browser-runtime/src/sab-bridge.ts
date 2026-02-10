import {
  type SABLayout,
  DEFAULT_SAB_LAYOUT,
  SABRequestType,
} from './types'


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

  requestSync(type: SABRequestType, payload: Uint8Array): Uint8Array {
    const { int32, uint8, layout } = this

    Atomics.store(int32, layout.requestTypeOffset / 4, type)
    Atomics.store(
      int32,
      layout.requestLenOffset / 4,
      payload.byteLength,
    )
    uint8.set(payload, layout.requestDataOffset)

    Atomics.store(int32, layout.lockOffset / 4, 1)
    Atomics.notify(int32, layout.lockOffset / 4)
    Atomics.wait(int32, layout.lockOffset / 4, 1)

    const responseLen = Atomics.load(
      int32,
      layout.requestLenOffset / 4,
    )
    const responseStart = layout.requestDataOffset
    return uint8.slice(responseStart, responseStart + responseLen)
  }

  
  onRequest(
    handler: (
      type: SABRequestType,
      payload: Uint8Array,
    ) => Promise<Uint8Array>,
  ): void {
    this.handler = handler
    this.poll()
  }

  
  stopListening(): void {
    this.handler = null
  }

  private poll(): void {
    const { int32, uint8, layout } = this

    const check = () => {
      if (!this.handler) return

      const lock = Atomics.load(int32, layout.lockOffset / 4)
      if (lock === 1) {
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
