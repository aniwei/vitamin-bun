import type { JSContextBridge } from './types.js'

/**
 * Handle-based bridge between the WASM runtime and the browser's JavaScript
 * engine. Instead of embedding a full JS engine in WASM, we keep a handle
 * table on the host side and let the WASM binary reference JS objects via
 * integer handles.
 */
export class BrowserJSContext implements JSContextBridge {
  /** Map of integer handle → JS value. */
  private handles = new Map<number, unknown>()
  /** Next available handle number. */
  private nextHandle = 1

  constructor() {
    // Pre-populate handle 0 as `undefined`.
    this.handles.set(0, undefined)
  }

  /** Allocate a new handle for a JS value. */
  private allocate(value: unknown): number {
    const handle = this.nextHandle++
    this.handles.set(handle, value)
    return handle
  }

  /** Retrieve the JS value behind a handle. */
  private deref(handle: number): unknown {
    if (!this.handles.has(handle)) {
      throw new Error(`Invalid JS handle: ${handle}`)
    }
    return this.handles.get(handle)
  }

  eval(code: string): number {
    // Using indirect eval so that the code runs in global scope.
    // eslint-disable-next-line no-eval
    const result = (0, eval)(code)
    return this.allocate(result)
  }

  call(fnHandle: number, argHandles: number[]): number {
    const fn = this.deref(fnHandle)
    if (typeof fn !== 'function') {
      throw new TypeError(`Handle ${fnHandle} is not a function`)
    }
    const args = argHandles.map((h) => this.deref(h))
    // Functions are called with `undefined` as receiver. In non-strict mode
    // this falls back to the global object; in strict mode it stays undefined.
    const result = Reflect.apply(fn as Function, undefined, args)
    return this.allocate(result)
  }

  getProperty(objHandle: number, key: string): number {
    const obj = this.deref(objHandle)
    if (obj === null || obj === undefined) {
      throw new TypeError(`Cannot get property '${key}' of ${obj}`)
    }
    const value = Reflect.get(obj as object, key)
    return this.allocate(value)
  }

  setProperty(objHandle: number, key: string, valueHandle: number): void {
    const obj = this.deref(objHandle)
    if (obj === null || obj === undefined) {
      throw new TypeError(`Cannot set property '${key}' of ${obj}`)
    }
    const value = this.deref(valueHandle)
    Reflect.set(obj as object, key, value)
  }

  createObject(): number {
    return this.allocate({})
  }

  typeOf(handle: number): string {
    return typeof this.deref(handle)
  }

  release(handle: number): void {
    // Handle 0 (undefined) is never released.
    if (handle !== 0) {
      this.handles.delete(handle)
    }
  }
}
