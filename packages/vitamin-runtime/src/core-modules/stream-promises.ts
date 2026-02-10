export function createStreamPromisesModule(stream: {
  pipeline: (...streams: Array<unknown>) => Promise<void>
  finished?: (stream: unknown) => Promise<void>
}) {
  return {
    pipeline: (...streams: Array<unknown>) => stream.pipeline(...streams),
    finished: (input: unknown) => stream.finished?.(input) ?? Promise.resolve(),
  }
}
