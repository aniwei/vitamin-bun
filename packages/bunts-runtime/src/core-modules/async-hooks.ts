export function createAsyncHooksModule() {
  function createHook() {
    return {
      enable() {
        return this
      },
      disable() {
        return this
      },
    }
  }

  return { createHook }
}
