import type { WasmMemoryAccess } from './types'

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder('utf-8')

export class MemoryAccess implements WasmMemoryAccess {
  private _view: DataView
  private _bytes: Uint8Array

  constructor(public readonly memory: WebAssembly.Memory) {
    this._view = new DataView(memory.buffer)
    this._bytes = new Uint8Array(memory.buffer)
  }

  get view(): DataView {
    return this._view
  }

  get bytes(): Uint8Array {
    return this._bytes
  }

  readString(ptr: number, len: number): string {
    return textDecoder.decode(new Uint8Array(this.memory.buffer, ptr, len))
  }

  writeString(ptr: number, str: string): number {
    const encoded = textEncoder.encode(str)
    new Uint8Array(this.memory.buffer, ptr, encoded.byteLength).set(encoded)
    return encoded.byteLength
  }

  readBytes(ptr: number, len: number): Uint8Array {
    return new Uint8Array(this.memory.buffer, ptr, len).slice()
  }

  writeBytes(ptr: number, data: Uint8Array): void {
    new Uint8Array(this.memory.buffer, ptr, data.byteLength).set(data)
  }

  refresh(): void {
    this._view = new DataView(this.memory.buffer)
    this._bytes = new Uint8Array(this.memory.buffer)
  }
}
