type HookCallbacks = {
  init?: (asyncId: number, type: string, triggerAsyncId: number, resource: unknown) => void
  before?: (asyncId: number) => void
  after?: (asyncId: number) => void
  destroy?: (asyncId: number) => void
  promiseResolve?: (asyncId: number) => void
}

type HookRecord = HookCallbacks & { enabled: boolean }

type AsyncMeta = {
  type: string
  triggerAsyncId: number
  resource: unknown
}

class AsyncHooksState {
  private nextAsyncId = 1
  private currentAsyncId = 0
  private currentTriggerId = 0
  private hooks = new Set<HookRecord>()
  private meta = new Map<number, AsyncMeta>()
  private storages = new Set<AsyncLocalStorage<unknown>>()

  registerHook(callbacks: HookCallbacks): HookRecord {
    const record: HookRecord = { ...callbacks, enabled: false }
    this.hooks.add(record)
    return record
  }

  unregisterHook(record: HookRecord): void {
    this.hooks.delete(record)
  }

  registerStorage(storage: AsyncLocalStorage<unknown>): void {
    this.storages.add(storage)
  }

  unregisterStorage(storage: AsyncLocalStorage<unknown>): void {
    this.storages.delete(storage)
  }

  createAsyncId(type: string, triggerAsyncId: number, resource: unknown): number {
    const asyncId = this.nextAsyncId++
    this.meta.set(asyncId, { type, triggerAsyncId, resource })
    for (const storage of this.storages) {
      storage.propagateStore(triggerAsyncId, asyncId)
    }
    this.emitInit(asyncId, type, triggerAsyncId, resource)
    return asyncId
  }

  executionAsyncId(): number {
    return this.currentAsyncId
  }

  triggerAsyncId(): number {
    return this.currentTriggerId
  }

  runWithAsyncId(asyncId: number, fn: () => unknown): unknown {
    const meta = this.meta.get(asyncId)
    const triggerId = meta?.triggerAsyncId ?? this.currentAsyncId
    const prevAsyncId = this.currentAsyncId
    const prevTriggerId = this.currentTriggerId
    this.currentAsyncId = asyncId
    this.currentTriggerId = triggerId
    this.emitBefore(asyncId)
    try {
      return fn()
    } finally {
      this.emitAfter(asyncId)
      this.currentAsyncId = prevAsyncId
      this.currentTriggerId = prevTriggerId
    }
  }

  emitDestroy(asyncId: number): void {
    this.meta.delete(asyncId)
    for (const storage of this.storages) {
      storage.clearStore(asyncId)
    }
    for (const hook of this.hooks) {
      if (hook.enabled) hook.destroy?.(asyncId)
    }
  }

  emitPromiseResolve(asyncId: number): void {
    for (const hook of this.hooks) {
      if (hook.enabled) hook.promiseResolve?.(asyncId)
    }
  }

  private emitInit(asyncId: number, type: string, triggerAsyncId: number, resource: unknown): void {
    for (const hook of this.hooks) {
      if (hook.enabled) hook.init?.(asyncId, type, triggerAsyncId, resource)
    }
  }

  private emitBefore(asyncId: number): void {
    for (const hook of this.hooks) {
      if (hook.enabled) hook.before?.(asyncId)
    }
  }

  private emitAfter(asyncId: number): void {
    for (const hook of this.hooks) {
      if (hook.enabled) hook.after?.(asyncId)
    }
  }
}

const state = getAsyncHooksState()
patchAsyncScheduling(state)

export class AsyncResource {
  readonly asyncId: number
  readonly triggerAsyncId: number
  private destroyed = false

  constructor(type = 'AsyncResource', options?: { triggerAsyncId?: number }) {
    const trigger = options?.triggerAsyncId ?? state.executionAsyncId()
    this.triggerAsyncId = trigger
    this.asyncId = state.createAsyncId(type, trigger, this)
  }

  runInAsyncScope<T>(fn: (...args: unknown[]) => T, thisArg?: unknown, ...args: unknown[]): T {
    return state.runWithAsyncId(this.asyncId, () => fn.apply(thisArg, args)) as T
  }

  emitDestroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    state.emitDestroy(this.asyncId)
  }
}

export class AsyncLocalStorage<T> {
  private store = new Map<number, T>()

  constructor() {
    state.registerStorage(this as AsyncLocalStorage<unknown>)
  }

  disable(): void {
    this.store.clear()
    state.unregisterStorage(this as AsyncLocalStorage<unknown>)
  }

  getStore(): T | undefined {
    return this.store.get(state.executionAsyncId())
  }

  enterWith(store: T): void {
    this.store.set(state.executionAsyncId(), store)
  }

  run<R>(store: T, callback: (...args: unknown[]) => R, ...args: unknown[]): R {
    const resource = new AsyncResource('AsyncLocalStorage')
    this.store.set(resource.asyncId, store)
    try {
      return resource.runInAsyncScope(() => callback(...args))
    } finally {
      resource.emitDestroy()
    }
  }

  propagateStore(fromAsyncId: number, toAsyncId: number): void {
    if (this.store.has(fromAsyncId)) {
      this.store.set(toAsyncId, this.store.get(fromAsyncId) as T)
    }
  }

  clearStore(asyncId: number): void {
    this.store.delete(asyncId)
  }
}

export function createAsyncHooksModule() {
  function createHook(callbacks: HookCallbacks) {
    const record = state.registerHook(callbacks)
    return {
      enable() {
        record.enabled = true
        return this
      },
      disable() {
        record.enabled = false
        return this
      },
    }
  }

  function executionAsyncId() {
    return state.executionAsyncId()
  }

  function triggerAsyncId() {
    return state.triggerAsyncId()
  }

  return {
    createHook,
    executionAsyncId,
    triggerAsyncId,
    AsyncResource,
    AsyncLocalStorage,
  }
}

function getAsyncHooksState(): AsyncHooksState {
  const key = Symbol.for('bunts.async_hooks.state')
  const globalState = globalThis as typeof globalThis & { [key]?: AsyncHooksState }
  if (!globalState[key]) {
    globalState[key] = new AsyncHooksState()
  }
  return globalState[key] as AsyncHooksState
}

function patchAsyncScheduling(stateRef: AsyncHooksState): void {
  const key = Symbol.for('bunts.async_hooks.patched')
  const globalState = globalThis as typeof globalThis & { [key]?: boolean }
  if (globalState[key]) return
  globalState[key] = true

  const wrap = (fn: unknown, type: string) => {
    if (typeof fn !== 'function') return fn
    const asyncId = stateRef.createAsyncId(type, stateRef.executionAsyncId(), fn)
    return function wrapped(this: unknown, ...args: unknown[]) {
      try {
        return stateRef.runWithAsyncId(asyncId, () => (fn as (...args: unknown[]) => unknown).apply(this, args))
      } finally {
        stateRef.emitPromiseResolve(asyncId)
        stateRef.emitDestroy(asyncId)
      }
    }
  }

  if (typeof queueMicrotask === 'function') {
    const original = queueMicrotask
    globalThis.queueMicrotask = (callback: () => void) => {
      return original(wrap(callback, 'MICROTASK') as () => void)
    }
  }

  if (typeof setTimeout === 'function') {
    const original = setTimeout
    globalThis.setTimeout = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return original(wrap(handler, 'TIMER') as (...args: unknown[]) => void, timeout, ...args)
    }) as typeof setTimeout
  }

  if (typeof setInterval === 'function') {
    const original = setInterval
    globalThis.setInterval = ((handler: (...args: unknown[]) => void, timeout?: number, ...args: unknown[]) => {
      return original(wrap(handler, 'INTERVAL') as (...args: unknown[]) => void, timeout, ...args)
    }) as typeof setInterval
  }

  const originalThen = Promise.prototype.then
  Promise.prototype.then = (function then(
    this: Promise<unknown>,
    onFulfilled?: ((value: unknown) => unknown) | null,
    onRejected?: ((reason: unknown) => unknown) | null,
  ) {
    return originalThen.call(
      this,
      wrap(onFulfilled, 'PROMISE') as ((value: unknown) => unknown) | null | undefined,
      wrap(onRejected, 'PROMISE') as ((reason: unknown) => unknown) | null | undefined,
    )
  }) as typeof Promise.prototype.then

  const originalCatch = Promise.prototype.catch
  Promise.prototype.catch = function catchMethod(onRejected?: ((reason: unknown) => unknown) | null) {
    return originalCatch.call(
      this,
      wrap(onRejected as ((reason: unknown) => unknown) | null | undefined, 'PROMISE') as
        | ((reason: unknown) => unknown)
        | null
        | undefined,
    )
  }

  const originalFinally = Promise.prototype.finally
  Promise.prototype.finally = function finallyMethod(onFinally?: (() => void) | null) {
    return originalFinally.call(
      this,
      wrap(onFinally as (() => void) | null | undefined, 'PROMISE') as (() => void) | null | undefined,
    )
  }
}
