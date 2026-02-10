import { applyAddRequest, readManifest, writeManifest } from './manifest'
import type { VirtualFileSystem } from '@vitamin-ai/virtual-fs'
import type { AddRequest } from './types'

export type AddFlowOptions = {
  vfs: VirtualFileSystem
  cwd: string
  requests: AddRequest[]
}

export async function runAddFlow(options: AddFlowOptions): Promise<void> {
  const manifestPath = `${options.cwd.replace(/\/+$/, '') || '/'}\/package.json`
  let manifest = readManifest(options.vfs, manifestPath)

  for (const request of options.requests) {
    manifest = applyAddRequest(manifest, request)
  }

  writeManifest(options.vfs, manifestPath, manifest)
}
