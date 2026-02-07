export function createSchedulerModule() {
  return {
    now: () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
    yield: () => Promise.resolve(),
  }
}
