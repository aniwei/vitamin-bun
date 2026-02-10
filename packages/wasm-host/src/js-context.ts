import type { JSHandle, JSContextImports, WasmMemoryAccess } from './types'

export class JSContextBridge implements JSContextImports {
  private handleTable = new Map<JSHandle, unknown>()
  private static readonly HANDLE_UNDEFINED = 0
  private static readonly HANDLE_NULL = 1
  private static readonly HANDLE_TRUE = 2
  private static readonly HANDLE_FALSE = 3
  private static readonly HANDLE_GLOBAL = 4
  private static readonly FIRST_DYNAMIC_HANDLE = 5

  private nextHandle = JSContextBridge.FIRST_DYNAMIC_HANDLE
  private mem!: WasmMemoryAccess

  constructor() {
    this.handleTable.set(JSContextBridge.HANDLE_UNDEFINED, undefined)
    this.handleTable.set(JSContextBridge.HANDLE_NULL, null)
    this.handleTable.set(JSContextBridge.HANDLE_TRUE, true)
    this.handleTable.set(JSContextBridge.HANDLE_FALSE, false)
    this.handleTable.set(
      JSContextBridge.HANDLE_GLOBAL,
      typeof globalThis !== 'undefined' ? globalThis : self,
    )
  }

  setMemory(mem: WasmMemoryAccess): void {
    this.mem = mem
  }

  private toHandle(value: unknown): JSHandle {
    if (value === undefined) return JSContextBridge.HANDLE_UNDEFINED
    if (value === null) return JSContextBridge.HANDLE_NULL
    if (value === true) return JSContextBridge.HANDLE_TRUE
    if (value === false) return JSContextBridge.HANDLE_FALSE

    for (const [handle, existing] of this.handleTable) {
      if (existing === value && handle >= JSContextBridge.FIRST_DYNAMIC_HANDLE) {
        return handle
      }
    }

    const handle = this.nextHandle++
    this.handleTable.set(handle, value)
    return handle
  }

  private fromHandle(handle: JSHandle): unknown {
    if (!this.handleTable.has(handle)) {
      throw new Error(`Invalid JS handle: ${handle}`)
    }
    return this.handleTable.get(handle)
  }

  js_context_eval(codePtr: number, codeLen: number): JSHandle {
    const code = this.mem.readString(codePtr, codeLen)
    try {
      const result = new Function(`return (${code})`)()
      return this.toHandle(result)
    } catch (e) {
      return this.toHandle(e)
    }
  }

  js_context_call(
    fnHandle: JSHandle,
    thisHandle: JSHandle,
    argsPtr: number,
    argsLen: number,
  ): JSHandle {
    const fn = this.fromHandle(fnHandle)
    const thisArg = this.fromHandle(thisHandle)

    if (typeof fn !== 'function') {
      return this.toHandle(new TypeError('Not a function'))
    }

    const args: unknown[] = []
    for (let i = 0; i < argsLen; i++) {
      const argHandle = this.mem.view.getInt32(argsPtr + i * 4, true)
      args.push(this.fromHandle(argHandle))
    }

    try {
      const result = Reflect.apply(fn, thisArg, args)
      return this.toHandle(result)
    } catch (e) {
      return this.toHandle(e)
    }
  }

  js_context_get_property(
    objHandle: JSHandle,
    namePtr: number,
    nameLen: number,
  ): JSHandle {
    const obj = this.fromHandle(objHandle) as Record<string, unknown>
    const name = this.mem.readString(namePtr, nameLen)

    try {
      const value = Reflect.get(obj, name)
      return this.toHandle(value)
    } catch (e) {
      return this.toHandle(e)
    }
  }

  js_context_set_property(
    objHandle: JSHandle,
    namePtr: number,
    nameLen: number,
    valueHandle: JSHandle,
  ): void {
    const obj = this.fromHandle(objHandle) as Record<string, unknown>
    const name = this.mem.readString(namePtr, nameLen)
    const value = this.fromHandle(valueHandle)

    Reflect.set(obj, name, value)
  }

  js_context_create_object(): JSHandle {
    return this.toHandle(Object.create(null))
  }

  js_context_typeof(handle: JSHandle): JSHandle {
    const value = this.fromHandle(handle)
    return this.toHandle(typeof value)
  }

  js_context_release(handle: JSHandle): void {
    if (handle >= JSContextBridge.FIRST_DYNAMIC_HANDLE) {
      this.handleTable.delete(handle)
    }
  }

  js_context_global(): JSHandle {
    return JSContextBridge.HANDLE_GLOBAL
  }

  getImports(): { env: JSContextImports } {
    return {
      env: {
        js_context_eval: this.js_context_eval.bind(this),
        js_context_call: this.js_context_call.bind(this),
        js_context_get_property: this.js_context_get_property.bind(this),
        js_context_set_property: this.js_context_set_property.bind(this),
        js_context_create_object: this.js_context_create_object.bind(this),
        js_context_typeof: this.js_context_typeof.bind(this),
        js_context_release: this.js_context_release.bind(this),
        js_context_global: this.js_context_global.bind(this),
      },
    }
  }

  get liveHandleCount(): number {
    return this.handleTable.size - JSContextBridge.FIRST_DYNAMIC_HANDLE
  }
}
