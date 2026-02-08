import { warnUnsupported } from '../shared/warn-unsupported'

type PerfEntryType = 'mark' | 'measure' | 'function' | string

type PerformanceObserverCallback = (
  list: PerformanceObserverEntryList | PerformanceObserverEntryListLike,
  observer: PerformanceObserver,
) => void

type PerformanceObserverEntryListLike = {
  getEntries: () => PerformanceEntryLike[]
  getEntriesByType?: (type: string) => PerformanceEntryLike[]
  getEntriesByName?: (name: string, type?: string) => PerformanceEntryLike[]
}

type PerformanceEntryLike = {
  name: string
  entryType: string
  startTime: number
  duration: number
}

type PerformanceObserverOptions = {
  entryTypes?: string[]
  type?: string
  buffered?: boolean
}

class PerformanceEntry {
  name: string
  entryType: PerfEntryType
  startTime: number
  duration: number
  detail?: unknown

  constructor(options: { name: string; entryType: PerfEntryType; startTime: number; duration: number; detail?: unknown }) {
    this.name = options.name
    this.entryType = options.entryType
    this.startTime = options.startTime
    this.duration = options.duration
    this.detail = options.detail
  }
}

class PerformanceObserverEntryList {
  private entries: PerformanceEntry[]

  constructor(entries: PerformanceEntry[]) {
    this.entries = entries
  }

  getEntries(): PerformanceEntry[] {
    return [...this.entries]
  }

  getEntriesByType(type: string): PerformanceEntry[] {
    return this.entries.filter((entry) => entry.entryType === type)
  }

  getEntriesByName(name: string, type?: string): PerformanceEntry[] {
    if (!type) return this.entries.filter((entry) => entry.name === name)
    return this.entries.filter((entry) => entry.name === name && entry.entryType === type)
  }
}

class PerformanceObserver {
  private callback: PerformanceObserverCallback
  private entryTypes: Set<string> | null = null
  private records: PerformanceEntry[] = []
  private scheduled = false
  private nativeObserver: globalThis.PerformanceObserver | null = null

  constructor(callback: PerformanceObserverCallback) {
    this.callback = callback
  }

  observe(options: PerformanceObserverOptions) {
    const types = options.entryTypes ?? (options.type ? [options.type] : [])
    this.entryTypes = new Set(types)
    const useNative = typeof globalThis.PerformanceObserver === 'function' && types.some((type) => type !== 'function')
    if (useNative) {
      this.nativeObserver = new globalThis.PerformanceObserver((list) => {
        this.callback(list as PerformanceObserverEntryListLike, this)
      })
      this.nativeObserver.observe(options)
    }

    if (this.entryTypes.has('function')) {
      observers.add(this)
      if (options.buffered && functionEntries.length > 0) {
        this.enqueue(functionEntries)
      }
    }
  }

  disconnect() {
    this.nativeObserver?.disconnect()
    observers.delete(this)
    this.records = []
    this.scheduled = false
  }

  takeRecords(): PerformanceEntry[] {
    const records = [...this.records]
    this.records = []
    if (this.nativeObserver) {
      const nativeRecords = this.nativeObserver.takeRecords?.() ?? []
      records.push(...(nativeRecords as PerformanceEntry[]))
    }
    return records
  }

  enqueue(entriesToAdd: PerformanceEntry[] | PerformanceEntry) {
    const list = Array.isArray(entriesToAdd) ? entriesToAdd : [entriesToAdd]
    this.records.push(...list)
    if (this.scheduled) return
    this.scheduled = true
    queueMicrotask(() => {
      this.scheduled = false
      if (this.records.length === 0) return
      const batch = this.takeRecords()
      this.callback(new PerformanceObserverEntryList(batch), this)
    })
  }

  shouldObserve(type: string): boolean {
    if (!this.entryTypes) return false
    return this.entryTypes.has(type)
  }
}

const nativePerformance = globalThis.performance
const timeOrigin = nativePerformance?.timeOrigin ?? Date.now()
const now = () => (nativePerformance?.now ? nativePerformance.now() : Date.now() - timeOrigin)
const entries: PerformanceEntry[] = []
const functionEntries: PerformanceEntry[] = []
const observers = new Set<PerformanceObserver>()

function recordEntry(entry: PerformanceEntry) {
  entries.push(entry)
  for (const observer of observers) {
    if (observer.shouldObserve(entry.entryType)) {
      observer.enqueue(entry)
    }
  }
}

function recordFunctionEntry(entry: PerformanceEntry) {
  functionEntries.push(entry)
  for (const observer of observers) {
    if (observer.shouldObserve(entry.entryType)) {
      observer.enqueue(entry)
    }
  }
}

function findLastEntry(name: string, type: PerfEntryType): PerformanceEntry | undefined {
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const entry = entries[i]
    if (entry.name === name && entry.entryType === type) return entry
  }
  return undefined
}

const performanceImpl = {
  timeOrigin,
  now,
  mark: (name: string, options?: { detail?: unknown }) => {
    if (nativePerformance?.mark) {
      return nativePerformance.mark(name, options)
    }
    const entry = new PerformanceEntry({ name, entryType: 'mark', startTime: now(), duration: 0, detail: options?.detail })
    recordEntry(entry)
    return entry
  },
  measure: (
    name: string,
    startOrOptions?: string | { start?: string; end?: string; duration?: number; detail?: unknown },
    endMark?: string,
  ) => {
    if (nativePerformance?.measure) {
      return nativePerformance.measure(name, startOrOptions as string, endMark)
    }
    let startTime = 0
    let endTime = now()
    let detail: unknown

    if (typeof startOrOptions === 'string') {
      const startEntry = findLastEntry(startOrOptions, 'mark')
      startTime = startEntry?.startTime ?? startTime
      if (endMark) {
        const endEntry = findLastEntry(endMark, 'mark')
        endTime = endEntry?.startTime ?? endTime
      }
    } else if (startOrOptions && typeof startOrOptions === 'object') {
      if (startOrOptions.start) {
        const startEntry = findLastEntry(startOrOptions.start, 'mark')
        startTime = startEntry?.startTime ?? startTime
      }
      if (startOrOptions.end) {
        const endEntry = findLastEntry(startOrOptions.end, 'mark')
        endTime = endEntry?.startTime ?? endTime
      }
      if (typeof startOrOptions.duration === 'number') {
        startTime = startTime || now()
        endTime = startTime + startOrOptions.duration
      }
      detail = startOrOptions.detail
    }

    const duration = Math.max(0, endTime - startTime)
    const entry = new PerformanceEntry({ name, entryType: 'measure', startTime, duration, detail })
    recordEntry(entry)
    return entry
  },
  clearMarks: (name?: string) => {
    nativePerformance?.clearMarks?.(name)
    if (!name) {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'mark') entries.splice(i, 1)
      }
      return
    }
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].entryType === 'mark' && entries[i].name === name) entries.splice(i, 1)
    }
  },
  clearMeasures: (name?: string) => {
    nativePerformance?.clearMeasures?.(name)
    if (!name) {
      for (let i = entries.length - 1; i >= 0; i -= 1) {
        if (entries[i].entryType === 'measure') entries.splice(i, 1)
      }
      return
    }
    for (let i = entries.length - 1; i >= 0; i -= 1) {
      if (entries[i].entryType === 'measure' && entries[i].name === name) entries.splice(i, 1)
    }
  },
  getEntries: () => {
    const nativeEntries = nativePerformance?.getEntries?.() ?? []
    return [...nativeEntries, ...functionEntries]
  },
  getEntriesByType: (type: string) => {
    if (type === 'function') return [...functionEntries]
    if (nativePerformance?.getEntriesByType) return nativePerformance.getEntriesByType(type)
    return entries.filter((entry) => entry.entryType === type)
  },
  getEntriesByName: (name: string, type?: string) => {
    if (type === 'function') return functionEntries.filter((entry) => entry.name === name)
    if (nativePerformance?.getEntriesByName) return nativePerformance.getEntriesByName(name, type)
    if (!type) return entries.filter((entry) => entry.name === name)
    return entries.filter((entry) => entry.name === name && entry.entryType === type)
  },
  setResourceTimingBufferSize: () => {
    warnUnsupported('perf_hooks.resource_timing', 'Resource timing buffer is not supported in browser runtime')
  },
  clearResourceTimings: () => {
    warnUnsupported('perf_hooks.resource_timing', 'Resource timing buffer is not supported in browser runtime')
  },
  markResourceTiming: () => {
    warnUnsupported('perf_hooks.resource_timing', 'Resource timing buffer is not supported in browser runtime')
  },
}

function timerify<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const name = fn.name || 'anonymous'
  const wrapped = (...args: Parameters<T>): ReturnType<T> => {
    const start = now()
    try {
      return fn(...args) as ReturnType<T>
    } finally {
      const duration = now() - start
      const entry = new PerformanceEntry({ name, entryType: 'function', startTime: start, duration })
      recordFunctionEntry(entry)
    }
  }
  return wrapped as T
}

function monitorEventLoopDelay() {
  warnUnsupported('perf_hooks.event_loop', 'Event loop delay monitoring is not available in browser runtime')
  return {
    enable: () => {},
    disable: () => {},
    min: 0,
    max: 0,
    mean: 0,
    stddev: 0,
    reset: () => {},
  }
}

function eventLoopUtilization() {
  warnUnsupported('perf_hooks.event_loop', 'Event loop utilization is not available in browser runtime')
  return { idle: 0, active: 0, utilization: 0 }
}

function createHistogram() {
  warnUnsupported('perf_hooks.histogram', 'Histogram is not available in browser runtime')
  return {
    min: 0,
    max: 0,
    mean: 0,
    exceeds: 0,
    stddev: 0,
    reset: () => {},
  }
}

export function createPerfHooksModule() {
  return {
    performance: performanceImpl,
    PerformanceObserver,
    PerformanceObserverEntryList,
    PerformanceEntry,
    timerify,
    monitorEventLoopDelay,
    eventLoopUtilization,
    createHistogram,
  }
}
