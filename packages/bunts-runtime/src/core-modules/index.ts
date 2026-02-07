import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { RuntimePolyfill } from './polyfill'
import type { RuntimeCore } from './runtime-core'
import { createAssertModule } from './core-modules/assert'
import { createAssertStrictModule } from './core-modules/assert-strict'
import { createAsyncHooksModule } from './core-modules/async-hooks'
import { createBufferModule } from './core-modules/buffer'
import { createConstantsModule } from './core-modules/constants'
import { createCryptoModule } from './core-modules/crypto'
import { createDiagnosticsChannelModule } from './core-modules/diagnostics-channel'
import { createEventsModule } from './core-modules/events'
import { createFsModule, createFsPromisesModule } from './core-modules/fs'
import { createHttpModule } from './core-modules/http'
import { createInspectorModule } from './core-modules/inspector'
import { createModuleModule } from './core-modules/module'
import { createNetModule } from './core-modules/net'
import { createOsModule } from './core-modules/os'
import { createPathModule } from './core-modules/path'
import { createPerfHooksModule } from './core-modules/perf-hooks'
import { createPunycodeModule } from './core-modules/punycode'
import { createQuerystringModule } from './core-modules/querystring'
import { createSchedulerModule } from './core-modules/scheduler'
import { createStreamModule } from './core-modules/stream'
import { createStreamPromisesModule } from './core-modules/stream-promises'
import { createStreamWebModule } from './core-modules/stream-web'
import { createStringDecoderModule } from './core-modules/string-decoder'
import { createTimersModule, createTimersPromisesModule } from './core-modules/timers'
import { createTlsModule } from './core-modules/tls'
import { createTtyModule } from './core-modules/tty'
import { createUrlModule } from './core-modules/url'
import { createUtilModule } from './core-modules/util'
import { createWorkerThreadsModule } from './core-modules/worker-threads'
import { createZlibModule } from './core-modules/zlib'

export type CoreModuleMap = Record<string, unknown>

export function createCoreModules(
  vfs: VirtualFileSystem,
  runtime: RuntimePolyfill,
  runtimeCore?: RuntimeCore,
): CoreModuleMap {
  const fs = createFsModule(vfs)
  const fsPromises = createFsPromisesModule(vfs)
  const timers = createTimersModule()
  const timersPromises = createTimersPromisesModule()
  const events = createEventsModule()
  const crypto = createCryptoModule()
  const assert = createAssertModule()
  const util = createUtilModule()
  const stream = createStreamModule()
  const streamPromises = createStreamPromisesModule(stream)
  const os = createOsModule()
  const path = createPathModule()
  const buffer = createBufferModule()
  const url = createUrlModule()
  const querystring = createQuerystringModule()
  const stringDecoder = createStringDecoderModule()
  const perfHooks = createPerfHooksModule()
  const asyncHooks = createAsyncHooksModule()
  const scheduler = createSchedulerModule()
  const inspector = createInspectorModule()
  const moduleModule = createModuleModule(runtimeCore)
  const tty = createTtyModule()
  const constants = createConstantsModule()
  const punycode = createPunycodeModule()
  const assertStrict = createAssertStrictModule(assert)
  const diagnosticsChannel = createDiagnosticsChannelModule()
  const http = createHttpModule()
  const https = createHttpModule()
  const net = createNetModule()
  const tls = createTlsModule()
  const zlib = createZlibModule()
  const workerThreads = createWorkerThreadsModule()
  const streamWeb = createStreamWebModule()

  return {
    fs,
    'fs/promises': fsPromises,
    timers,
    'timers/promises': timersPromises,
    events,
    crypto,
    assert,
    util,
    stream,
    'stream/promises': streamPromises,
    os,
    path,
    'path/posix': path,
    'path/win32': path,
    buffer,
    url,
    querystring,
    string_decoder: stringDecoder,
    perf_hooks: perfHooks,
    async_hooks: asyncHooks,
    scheduler,
    inspector,
    module: moduleModule,
    tty,
    constants,
    punycode,
    'assert/strict': assertStrict,
    diagnostics_channel: diagnosticsChannel,
    http,
    https,
    net,
    tls,
    zlib,
    worker_threads: workerThreads,
    'stream/web': streamWeb,
    process: runtime.process,
  }
}