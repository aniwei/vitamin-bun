import { createUnavailableModule } from './vitamin-unavailable'

export function createBunFfiModule(): Record<string, unknown> {
  return createUnavailableModule('bun:ffi is not available in browser runtime')
}
