import { createSocketStub } from './net'

export function createTlsModule() {
  return {
    connect: () => createSocketStub(),
  }
}
