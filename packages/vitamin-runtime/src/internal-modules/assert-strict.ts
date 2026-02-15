import type { createAssertModule } from './assert'

export function createAssertStrictModule(assertModule: ReturnType<typeof createAssertModule>) {
  return assertModule
}
