export function createSocketStub() {
  return {
    on: (_event: string, _listener: (...args: unknown[]) => void) => {},
    write: (_data?: unknown) => {},
    end: () => {},
  }
}

export function createNetModule() {
  return {
    connect: () => createSocketStub(),
  }
}
