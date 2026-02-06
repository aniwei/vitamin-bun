/**
 * @vitamin-bun/config
 * 
 * Configuration management for vitamin-bun.
 * Provides type-safe configuration loading and validation.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Server configuration
 */
export interface ServerConfig {
  port?: number
  host?: string
}

/**
 * Development configuration
 */
export interface DevConfig {
  hot?: boolean
  open?: boolean
}

/**
 * Build configuration
 */
export interface BuildConfig {
  outDir?: string
  minify?: boolean
}

/**
 * Main configuration interface
 */
export interface VitaminConfig {
  server?: ServerConfig
  dev?: DevConfig
  build?: BuildConfig
}

/**
 * Config loading options
 */
export interface LoadConfigOptions {
  configFile?: string
  cwd?: string
}

// ============================================================================
// Functions
// ============================================================================

/**
 * Define a configuration object with type safety
 * 
 * @example
 * ```typescript
 * import { defineConfig } from '@vitamin-bun/config'
 * 
 * export default defineConfig({
 *   server: {
 *     port: 3000,
 *     host: 'localhost'
 *   },
 *   dev: {
 *     hot: true,
 *     open: true
 *   }
 * })
 * ```
 */
export function defineConfig<T extends VitaminConfig = VitaminConfig>(
  config: T,
): T {
  return config
}

/**
 * Load configuration from file
 * 
 * Supported config file names:
 * - vitamin.config.ts
 * - vitamin.config.js
 * - vitamin.config.json
 */
export async function loadConfig<T extends VitaminConfig = VitaminConfig>(
  options: LoadConfigOptions = {},
): Promise<T> {
  const { configFile, cwd = process.cwd() } = options
  
  // TODO: Implement config file loading
  console.log(`[vitamin-bun] Loading config from ${cwd}`)
  
  return {} as T
}

/**
 * Merge multiple configuration objects
 */
export function mergeConfig<T extends VitaminConfig>(
  ...configs: Partial<T>[]
): T {
  return Object.assign({}, ...configs) as T
}

// ============================================================================
// Exports
// ============================================================================

export default defineConfig
