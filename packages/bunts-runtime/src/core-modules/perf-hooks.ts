export function createPerfHooksModule() {
  const perf = globalThis.performance
    ? globalThis.performance
    : {
        now: () => Date.now(),
        timeOrigin: Date.now(),
      }

  return { performance: perf }
}
