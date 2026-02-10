import { createAssertModule } from './assert'
import { createAssertStrictModule } from './assert-strict'
import { createAsyncHooksModule } from './async-hooks'
import { createBufferModule } from './buffer'
import { createBunFfiModule } from './vitamin-ffi'
import { createBunGlobModule } from './vitamin-glob'
import { createBunSemverModule } from './vitamin-semver'
import { createBunSqliteModule } from './vitamin-sqlite'
import { createBunTranspilerModule } from './vitamin-transpiler'
import { createChildProcessModule } from './child-process'
import { createConstantsModule } from './constants'
import { createCryptoModule } from './crypto'
import { createDiagnosticsChannelModule } from './diagnostics-channel'
import { createEventsModule } from './events'
import { createFsModule, createFsPromisesModule } from './fs'
import { createHttpModule } from './http'
import { createInspectorModule } from './inspector'
import { createModuleModule } from './module'
import { createNetModule } from './net'
import { createOsModule } from './os'
import { createPathModule } from './path'
import { createPerfHooksModule } from './perf-hooks'
import { createPunycodeModule } from './punycode'
import { createQuerystringModule } from './querystring'
import { createSchedulerModule } from './scheduler'
import { createStreamModule } from './stream'
import { createStreamPromisesModule } from './stream-promises'
import { createStreamWebModule } from './stream-web'
import { createStringDecoderModule } from './string-decoder'
import { createTimersModule, createTimersPromisesModule } from './timers'
import { createTlsModule } from './tls'
import { createTtyModule } from './tty'
import { createUrlModule } from './url'
import { createUtilModule } from './util'
import { createWorkerThreadsModule } from './worker-threads'
import { createZlibModule } from './zlib'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { BunRuntime } from '../vitamin-runtime'
import type { RuntimeCore } from '../runtime-core'

export type CoreModuleMap = Record<string, unknown>

export function createCoreModules(
  vfs: VirtualFileSystem,
  runtime: BunRuntime,
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
  const streamPromises = createStreamPromisesModule(
    stream as { pipeline: (...streams: Array<unknown>) => Promise<void>; finished?: (stream: unknown) => Promise<void> },
  )
  const os = createOsModule()
  const path = createPathModule()
  const buffer = createBufferModule()
  const bunGlob = createBunGlobModule(vfs)
  const bunSemver = createBunSemverModule()
  const bunTranspiler = createBunTranspilerModule()
  const childProcess = createChildProcessModule()
  const bunSqlite = createBunSqliteModule(runtime)
  const bunFfi = createBunFfiModule()
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
  const http = createHttpModule(runtime, 'http:')
  const https = createHttpModule(runtime, 'https:')
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
    'bun:glob': bunGlob,
    'bun:semver': bunSemver,
    'bun:transpiler': bunTranspiler,
    'bun:sqlite': bunSqlite,
    'bun:ffi': bunFfi,
    url,
    child_process: childProcess,
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
