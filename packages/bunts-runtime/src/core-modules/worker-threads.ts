export function createWorkerThreadsModule() {
  class Worker {
    constructor() {
      throw new Error('worker_threads is not supported in the browser runtime')
    }
  }

  return {
    isMainThread: true,
    threadId: 0,
    parentPort: null,
    workerData: null,
    Worker,
  }
}
