export type UnavailableModule = { __unavailable: string }

export function createUnavailableModule(message: string): UnavailableModule {
  return { __unavailable: message }
}
