/**
 * @vitamin-bun/core
 * 
 * Core runtime and framework foundation for vitamin-bun.
 * Provides the base Application, Context, and Middleware system.
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Next function for middleware chain
 */
export type Next = () => Promise<void>

/**
 * Middleware function type
 */
export type Middleware<TState = any> = (
  ctx: Context<TState>,
  next: Next,
) => Promise<void> | void

/**
 * Error handler function type
 */
export type ErrorHandler<TState = any> = (
  err: Error,
  ctx: Context<TState>,
) => void | Promise<void>

/**
 * Request context
 */
export interface Context<TState = any> {
  /** Original Bun request object */
  request: Request
  
  /** HTTP method */
  method: string
  
  /** Request path */
  path: string
  
  /** Query parameters */
  query: Record<string, string>
  
  /** Route parameters */
  params: Record<string, string>
  
  /** Request headers */
  headers: Headers
  
  /** Request body (parsed) */
  body?: any
  
  /** Response status code */
  status: number
  
  /** Application state */
  state: TState
  
  /** Set response header */
  set(name: string, value: string): void
  
  /** Send JSON response */
  json(data: any): void
  
  /** Send text response */
  text(data: string): void
  
  /** Send HTML response */
  html(data: string): void
}

// ============================================================================
// Application Class
// ============================================================================

/**
 * Main application class
 * 
 * @example
 * ```typescript
 * import { Application } from '@vitamin-bun/core'
 * 
 * const app = new Application()
 * 
 * app.use(async (ctx, next) => {
 *   console.log(`${ctx.method} ${ctx.path}`)
 *   await next()
 * })
 * 
 * app.listen(3000)
 * ```
 */
export class Application<TState = any> {
  private middlewares: Middleware<TState>[] = []
  private errorHandler?: ErrorHandler<TState>
  
  /**
   * Add a middleware to the application
   */
  use(middleware: Middleware<TState>): this {
    this.middlewares.push(middleware)
    return this
  }
  
  /**
   * Set error handler
   */
  onError(handler: ErrorHandler<TState>): this {
    this.errorHandler = handler
    return this
  }
  
  /**
   * Start listening on a port
   * 
   * @param port - Port number to listen on
   * @returns Server instance (placeholder)
   */
  listen(port: number): void {
    console.log(`[vitamin-bun] Server listening on port ${port}`)
    // TODO: Implement actual server using Bun.serve
  }
}

// ============================================================================
// Exports
// ============================================================================

export default Application
