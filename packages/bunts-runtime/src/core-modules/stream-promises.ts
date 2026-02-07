export function createStreamPromisesModule(stream: { pipeline: (...streams: Array<unknown>) => Promise<void> }) {
  return {
    pipeline: (...streams: Array<unknown>) => stream.pipeline(...streams),
  }
}
