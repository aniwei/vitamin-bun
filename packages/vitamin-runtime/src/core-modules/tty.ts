export function createTtyModule() {
  class WriteStream {}
  class ReadStream {}

  return {
    isatty: () => false,
    WriteStream,
    ReadStream,
  }
}
