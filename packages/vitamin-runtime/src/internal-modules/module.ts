import type { RuntimeCore } from '../runtime-core'

export function createModuleModule(runtimeCore?: RuntimeCore) {
  const createRequire = (fromPath: string) => {
    if (!runtimeCore) {
      throw new Error('createRequire is not available without RuntimeCore')
    }
    return runtimeCore.createRequire(fromPath)
  }

  return { createRequire }
}
