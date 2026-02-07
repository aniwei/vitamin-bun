export function createAssertModule() {
  class AssertionError extends Error {
    constructor(message?: string) {
      super(message ?? 'Assertion failed')
      this.name = 'AssertionError'
    }
  }

  function fail(message?: string): never {
    throw new AssertionError(message)
  }

  function ok(value: unknown, message?: string): void {
    if (!value) fail(message)
  }

  function strictEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual !== expected) fail(message ?? `Expected ${String(actual)} to strictly equal ${String(expected)}`)
  }

  function notStrictEqual(actual: unknown, expected: unknown, message?: string): void {
    if (actual === expected) fail(message ?? `Expected ${String(actual)} to not strictly equal ${String(expected)}`)
  }

  function matchesError(err: unknown, matcher?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown)): boolean {
    if (!matcher) return true
    if (matcher instanceof RegExp) {
      return matcher.test((err as { message?: string })?.message ?? String(err))
    }
    if (typeof matcher === 'function') {
      if ('prototype' in matcher) {
        return err instanceof (matcher as new (...args: unknown[]) => unknown)
      }
      return (matcher as (error: unknown) => boolean)(err)
    }
    return false
  }

  function throws(fn: () => unknown, error?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown), message?: string): void {
    try {
      fn()
    } catch (err) {
      if (!matchesError(err, error)) {
        fail(message ?? 'Thrown error did not match assertion')
      }
      return
    }
    fail(message ?? 'Function did not throw')
  }

  async function rejects(
    promise: Promise<unknown> | (() => Promise<unknown>),
    error?: RegExp | ((error: unknown) => boolean) | (new (...args: unknown[]) => unknown),
    message?: string,
  ): Promise<void> {
    try {
      const target = typeof promise === 'function' ? promise() : promise
      await target
    } catch (err) {
      if (!matchesError(err, error)) {
        fail(message ?? 'Rejected error did not match assertion')
      }
      return
    }
    fail(message ?? 'Promise did not reject')
  }

  return { AssertionError, fail, ok, strictEqual, notStrictEqual, throws, rejects }
}
