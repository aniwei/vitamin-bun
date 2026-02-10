import { describe, it, expect, beforeEach } from 'vitest'
import { MemoryAccess } from '../memory'

describe('MemoryAccess', () => {
  let memory: WebAssembly.Memory
  let mem: MemoryAccess

  beforeEach(() => {
    memory = new WebAssembly.Memory({ initial: 1 }) // 1 page = 64 KiB
    mem = new MemoryAccess(memory)
  })

  describe('readString / writeString', () => {
    it('round-trips an ASCII string', () => {
      const written = mem.writeString(0, 'hello')
      expect(written).toBe(5)
      expect(mem.readString(0, 5)).toBe('hello')
    })

    it('round-trips a UTF-8 string with multi-byte chars', () => {
      const str = '你好世界'
      const written = mem.writeString(256, str)
      expect(written).toBe(12) // 4 chars × 3 bytes/char
      expect(mem.readString(256, written)).toBe(str)
    })

    it('handles empty string', () => {
      const written = mem.writeString(0, '')
      expect(written).toBe(0)
      expect(mem.readString(0, 0)).toBe('')
    })
  })

  describe('readBytes / writeBytes', () => {
    it('round-trips a byte array', () => {
      const data = new Uint8Array([1, 2, 3, 4, 5])
      mem.writeBytes(100, data)
      const result = mem.readBytes(100, 5)
      expect(result).toEqual(data)
    })

    it('returns a copy (not a view)', () => {
      const data = new Uint8Array([10, 20, 30])
      mem.writeBytes(0, data)
      const result = mem.readBytes(0, 3)
      // Mutating the result should NOT affect memory
      result[0] = 99
      expect(mem.readBytes(0, 1)[0]).toBe(10)
    })
  })

  describe('view / bytes accessors', () => {
    it('provides a DataView', () => {
      expect(mem.view).toBeInstanceOf(DataView)
      mem.view.setUint32(0, 42, true)
      expect(mem.view.getUint32(0, true)).toBe(42)
    })

    it('provides a Uint8Array', () => {
      expect(mem.bytes).toBeInstanceOf(Uint8Array)
      mem.bytes[0] = 0xff
      expect(mem.bytes[0]).toBe(0xff)
    })
  })

  describe('refresh', () => {
    it('updates views after memory.grow()', () => {
      const oldBuffer = mem.view.buffer
      memory.grow(1) // grow by 1 page
      mem.refresh()
      // Buffer should be different after grow
      expect(mem.view.buffer).not.toBe(oldBuffer)
      expect(mem.view.buffer.byteLength).toBe(2 * 65536) // 2 pages
    })
  })
})
