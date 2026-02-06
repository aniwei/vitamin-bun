/**
 * Build-pipeline helpers for compiling Bun from source to a WASM binary.
 *
 * The Bun source code lives in the `vendor/bun` git submodule.  The build
 * pipeline mirrors the steps described in the technical design:
 *
 * ```
 * bun source (Zig + C)
 *        │
 *        ▼
 *   zig build -Dtarget=wasm32-wasi
 *        │
 *        ▼
 *   bun-core.wasm          (raw, ~40-80 MB)
 *        │
 *        ▼
 *   wasm-opt -Oz --strip   (Binaryen optimisation)
 *        │
 *        ▼
 *   bun-core.opt.wasm      (target < 20 MB gzip)
 * ```
 *
 * These helpers are **not** intended to run inside a browser — they are used
 * by the repository build system (CI / local dev) to produce the `.wasm`
 * artefact that the loader then fetches at runtime.
 */

/** Default path to the bun submodule source (relative to repo root). */
export const BUN_SOURCE_DIR = 'vendor/bun'

/** Default Zig target for WASM compilation. */
export const ZIG_TARGET = 'wasm32-wasi'

/** Default output filename for the raw WASM build. */
export const RAW_WASM_FILENAME = 'bun-core.wasm'

/** Default output filename for the optimised WASM build. */
export const OPT_WASM_FILENAME = 'bun-core.opt.wasm'

/** Options for the WASM build pipeline. */
export interface BuildOptions {
  /** Path to the bun source directory (default: {@link BUN_SOURCE_DIR}). */
  sourceDir?: string
  /** Directory to write build artefacts into. */
  outputDir?: string
  /** Zig build target (default: {@link ZIG_TARGET}). */
  target?: string
  /** Extra flags passed to `zig build`. */
  zigFlags?: string[]
  /** Extra flags passed to `wasm-opt`. */
  wasmOptFlags?: string[]
}

/**
 * Returns the `zig build` command-line tokens for compiling bun to WASM.
 *
 * This does **not** execute the command — it returns the argv array so the
 * caller can spawn the process with their preferred mechanism.
 */
export function zigBuildArgs(options: BuildOptions = {}): string[] {
  const target = options.target ?? ZIG_TARGET
  const extra = options.zigFlags ?? []
  return ['zig', 'build', `-Dtarget=${target}`, ...extra]
}

/**
 * Returns the `wasm-opt` command-line tokens for optimising the raw WASM
 * binary produced by `zig build`.
 */
export function wasmOptArgs(options: BuildOptions = {}): string[] {
  const input = `${options.outputDir ?? '.'}/${RAW_WASM_FILENAME}`
  const output = `${options.outputDir ?? '.'}/${OPT_WASM_FILENAME}`
  const extra = options.wasmOptFlags ?? ['-Oz', '--strip']
  return ['wasm-opt', ...extra, '-o', output, input]
}
