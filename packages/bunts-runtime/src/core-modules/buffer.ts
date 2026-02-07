export function createBufferModule() {
  class Buffer {
    static from(arrayLike: ArrayLike<number>): Uint8Array
    static from<T>(arrayLike: ArrayLike<T>, mapfn: (v: T, k: number) => number, thisArg?: unknown): Uint8Array
    static from(elements: Iterable<number>): Uint8Array
    static from<T>(elements: Iterable<T>, mapfn?: (v: T, k: number) => number, thisArg?: unknown): Uint8Array
    static from(data: string | ArrayBuffer | Uint8Array, encoding?: 'utf8' | 'utf-8'): Uint8Array
    static from(data: unknown, mapfn?: unknown, thisArg?: unknown): Uint8Array {
      if (typeof data === 'string') {
        return new TextEncoder().encode(data)
      }
      if (data instanceof Uint8Array) return new Uint8Array(data)
      if (data instanceof ArrayBuffer) return new Uint8Array(data)
      if (data && typeof (data as Iterable<unknown>)[Symbol.iterator] === 'function') {
        return Uint8Array.from(data as Iterable<number>, mapfn as (v: number, k: number) => number, thisArg as unknown)
      }
      return Uint8Array.from(data as ArrayLike<number>, mapfn as (v: number, k: number) => number, thisArg as unknown)
    }

    static alloc(size: number, fill: number | string = 0): Uint8Array {
      const out = new Uint8Array(size)
      if (typeof fill === 'number') {
        out.fill(fill)
        return out
      }
      const bytes = new TextEncoder().encode(fill)
      if (bytes.length === 0) return out
      for (let i = 0; i < out.length; i += 1) {
        out[i] = bytes[i % bytes.length]
      }
      return out
    }

    static concat(list: Uint8Array[]): Uint8Array {
      const total = list.reduce((sum, item) => sum + item.byteLength, 0)
      const out = new Uint8Array(total)
      let offset = 0
      for (const item of list) {
        out.set(item, offset)
        offset += item.byteLength
      }
      return out
    }
  }

  return { Buffer }
}
