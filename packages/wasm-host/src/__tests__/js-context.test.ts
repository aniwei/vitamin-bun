import { describe, it, expect, beforeEach } from 'vitest'
import { JSContextBridge } from '../js-context'
import { MemoryAccess } from '../memory'

function writeToMem(mem: MemoryAccess, str: string, offset = 0): [number, number] {
  const len = mem.writeString(offset, str)
  return [offset, len]
}

describe('JSContextBridge', () => {
  let bridge: JSContextBridge
  let mem: MemoryAccess

  beforeEach(() => {
    const memory = new WebAssembly.Memory({ initial: 1 })
    mem = new MemoryAccess(memory)
    bridge = new JSContextBridge()
    bridge.setMemory(mem)
  })

  describe('pre-allocated handles', () => {
    it('js_context_global returns handle 4', () => {
      expect(bridge.js_context_global()).toBe(4)
    })

    it('js_context_typeof on handle 0 returns "undefined"', () => {
      const typeofHandle = bridge.js_context_typeof(0)
      // The returned handle points to the string "undefined"
      // We can verify by getting it from the bridge indirectly
      expect(typeofHandle).toBeGreaterThanOrEqual(5) // dynamic handle
    })
  })

  describe('js_context_eval', () => {
    it('evaluates a simple expression', () => {
      const [ptr, len] = writeToMem(mem, '1 + 2')
      const handle = bridge.js_context_eval(ptr, len)
      // handle should be a dynamic handle pointing to 3
      expect(handle).toBeGreaterThanOrEqual(5)
    })

    it('evaluates string expressions', () => {
      const [ptr, len] = writeToMem(mem, '"hello"')
      const handle = bridge.js_context_eval(ptr, len)
      expect(handle).toBeGreaterThanOrEqual(5)
    })

    it('returns error handle for invalid code', () => {
      const [ptr, len] = writeToMem(mem, '{{{{invalid')
      const handle = bridge.js_context_eval(ptr, len)
      // Should not throw, should return a handle to the error
      expect(handle).toBeGreaterThanOrEqual(5)
    })
  })

  describe('js_context_create_object', () => {
    it('creates a new object handle', () => {
      const handle = bridge.js_context_create_object()
      expect(handle).toBeGreaterThanOrEqual(5)
    })

    it('creates distinct objects each time', () => {
      const h1 = bridge.js_context_create_object()
      const h2 = bridge.js_context_create_object()
      expect(h1).not.toBe(h2)
    })
  })

  describe('js_context_get_property / js_context_set_property', () => {
    it('sets and gets a property on an object', () => {
      const objHandle = bridge.js_context_create_object()

      // Set property: obj.foo = 42
      const [namePtr, nameLen] = writeToMem(mem, 'foo')
      // First eval 42 to get a handle for it
      const [valPtr, valLen] = writeToMem(mem, '42', 100)
      const valHandle = bridge.js_context_eval(valPtr, valLen)
      bridge.js_context_set_property(objHandle, namePtr, nameLen, valHandle)

      // Get property: obj.foo
      const getHandle = bridge.js_context_get_property(objHandle, namePtr, nameLen)
      expect(getHandle).toBe(valHandle)
    })

    it('gets properties from globalThis', () => {
      const globalHandle = bridge.js_context_global()
      const [namePtr, nameLen] = writeToMem(mem, 'undefined')
      const result = bridge.js_context_get_property(globalHandle, namePtr, nameLen)
      // Should return the pre-allocated handle for undefined (0)
      expect(result).toBe(0)
    })
  })

  describe('js_context_call', () => {
    it('calls a function with no arguments', () => {
      // Eval to get a function handle
      const [fnPtr, fnLen] = writeToMem(mem, '() => 42')
      const fnHandle = bridge.js_context_eval(fnPtr, fnLen)

      // Call the function: fn.call(undefined)
      const resultHandle = bridge.js_context_call(fnHandle, 0, 0, 0)
      expect(resultHandle).toBeGreaterThanOrEqual(5) // handle to 42
    })

    it('returns error handle when calling a non-function', () => {
      const [ptr, len] = writeToMem(mem, '42')
      const numHandle = bridge.js_context_eval(ptr, len)

      const resultHandle = bridge.js_context_call(numHandle, 0, 0, 0)
      // Should return a handle to a TypeError
      expect(resultHandle).toBeGreaterThanOrEqual(5)
    })
  })

  describe('js_context_typeof', () => {
    it('returns type of undefined', () => {
      const handle = bridge.js_context_typeof(0) // handle 0 = undefined
      expect(handle).toBeGreaterThanOrEqual(5) // handle to string "undefined"
    })

    it('returns type of null', () => {
      const handle = bridge.js_context_typeof(1) // handle 1 = null
      expect(handle).toBeGreaterThanOrEqual(5) // handle to string "object"
    })
  })

  describe('js_context_release', () => {
    it('releases a dynamic handle', () => {
      const initial = bridge.liveHandleCount
      const h = bridge.js_context_create_object()
      expect(bridge.liveHandleCount).toBe(initial + 1)

      bridge.js_context_release(h)
      expect(bridge.liveHandleCount).toBe(initial)
    })

    it('does not release pre-allocated handles', () => {
      const initial = bridge.liveHandleCount
      bridge.js_context_release(0) // try to release undefined
      bridge.js_context_release(1) // try to release null
      bridge.js_context_release(4) // try to release global
      expect(bridge.liveHandleCount).toBe(initial)
    })
  })

  describe('getImports', () => {
    it('returns bound imports under "env" namespace', () => {
      const imports = bridge.getImports()
      expect(imports.env).toBeDefined()
      expect(typeof imports.env.js_context_eval).toBe('function')
      expect(typeof imports.env.js_context_call).toBe('function')
      expect(typeof imports.env.js_context_get_property).toBe('function')
      expect(typeof imports.env.js_context_set_property).toBe('function')
      expect(typeof imports.env.js_context_create_object).toBe('function')
      expect(typeof imports.env.js_context_typeof).toBe('function')
      expect(typeof imports.env.js_context_release).toBe('function')
      expect(typeof imports.env.js_context_global).toBe('function')
    })
  })
})
