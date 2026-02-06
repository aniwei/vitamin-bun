/**
 * @vitamin-bun/cli
 * 
 * Command-line interface for vitamin-bun.
 * Provides development server, build, and other utilities.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * CLI command
 */
export interface Command {
  name: string
  description: string
  options?: CommandOption[]
  action: (args: any) => Promise<void> | void
}

/**
 * CLI command option
 */
export interface CommandOption {
  name: string
  alias?: string
  description: string
  default?: any
}

// ============================================================================
// Commands
// ============================================================================

/**
 * Development server command
 */
export const devCommand: Command = {
  name: 'dev',
  description: 'Start development server',
  options: [
    {
      name: 'port',
      alias: 'p',
      description: 'Port number',
      default: 3000,
    },
    {
      name: 'host',
      alias: 'h',
      description: 'Host address',
      default: 'localhost',
    },
  ],
  action: async (args) => {
    console.log('[vitamin] Starting development server...')
    console.log(`[vitamin] Port: ${args.port}`)
    console.log(`[vitamin] Host: ${args.host}`)
    // TODO: Implement dev server
  },
}

/**
 * Build command
 */
export const buildCommand: Command = {
  name: 'build',
  description: 'Build for production',
  options: [
    {
      name: 'outDir',
      alias: 'o',
      description: 'Output directory',
      default: 'dist',
    },
  ],
  action: async (args) => {
    console.log('[vitamin] Building for production...')
    console.log(`[vitamin] Output directory: ${args.outDir}`)
    // TODO: Implement build
  },
}

/**
 * Type check command
 */
export const typecheckCommand: Command = {
  name: 'typecheck',
  description: 'Run TypeScript type checking',
  action: async () => {
    console.log('[vitamin] Running type check...')
    // TODO: Implement typecheck
  },
}

// ============================================================================
// Exports
// ============================================================================

export const commands = [devCommand, buildCommand, typecheckCommand]

export default commands
