export function createStreamWebModule() {
  return {
    ReadableStream: globalThis.ReadableStream,
    WritableStream: globalThis.WritableStream,
    TransformStream: globalThis.TransformStream,
    ByteLengthQueuingStrategy: globalThis.ByteLengthQueuingStrategy,
    CountQueuingStrategy: globalThis.CountQueuingStrategy,
    TextEncoderStream: (globalThis as typeof globalThis & { TextEncoderStream?: unknown }).TextEncoderStream,
    TextDecoderStream: (globalThis as typeof globalThis & { TextDecoderStream?: unknown }).TextDecoderStream,
    CompressionStream: (globalThis as typeof globalThis & { CompressionStream?: unknown }).CompressionStream,
    DecompressionStream: (globalThis as typeof globalThis & { DecompressionStream?: unknown }).DecompressionStream,
  }
}
