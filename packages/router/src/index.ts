/**
 * @vitamin-bun/router
 * 
 * Router system for vitamin-bun.
 * Provides route matching and parameter extraction.
 */

import type { Context, Middleware } from '@vitamin-bun/core'

// ============================================================================
// Types
// ============================================================================

/**
 * HTTP methods supported by the router
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS'

/**
 * Route handler function
 */
export type Handler<TState = any> = (ctx: Context<TState>) => Promise<void> | void

/**
 * Route definition
 */
export interface Route<TState = any> {
  method: HttpMethod
  path: string
  handler: Handler<TState>
  middlewares: Middleware<TState>[]
}

// ============================================================================
// Router Class
// ============================================================================

/**
 * Router class for handling HTTP routes
 * 
 * @example
 * ```typescript
 * import { Router } from '@vitamin-bun/router'
 * 
 * const router = new Router()
 * 
 * router.get('/users/:id', async (ctx) => {
 *   const { id } = ctx.params
 *   ctx.json({ id, name: 'User' })
 * })
 * 
 * router.post('/users', async (ctx) => {
 *   const user = ctx.body
 *   ctx.json({ created: true })
 * })
 * ```
 */
export class Router<TState = any> {
  private routes: Route<TState>[] = []
  private middlewares: Middleware<TState>[] = []
  private prefix = ''
  
  /**
   * Add a middleware to all routes
   */
  use(middleware: Middleware<TState>): this {
    this.middlewares.push(middleware)
    return this
  }
  
  /**
   * Register a GET route
   */
  get(path: string, handler: Handler<TState>): this {
    return this.addRoute('GET', path, handler)
  }
  
  /**
   * Register a POST route
   */
  post(path: string, handler: Handler<TState>): this {
    return this.addRoute('POST', path, handler)
  }
  
  /**
   * Register a PUT route
   */
  put(path: string, handler: Handler<TState>): this {
    return this.addRoute('PUT', path, handler)
  }
  
  /**
   * Register a DELETE route
   */
  delete(path: string, handler: Handler<TState>): this {
    return this.addRoute('DELETE', path, handler)
  }
  
  /**
   * Register a PATCH route
   */
  patch(path: string, handler: Handler<TState>): this {
    return this.addRoute('PATCH', path, handler)
  }
  
  /**
   * Create a route group with a prefix
   */
  group(prefix: string, callback: (router: Router<TState>) => void): this {
    const groupRouter = new Router<TState>()
    groupRouter.prefix = this.prefix + prefix
    groupRouter.middlewares = [...this.middlewares]
    
    callback(groupRouter)
    
    this.routes.push(...groupRouter.routes)
    return this
  }
  
  /**
   * Get all registered routes
   */
  routes(): Middleware<TState> {
    return async (ctx, next) => {
      // TODO: Implement route matching and handler execution
      await next()
    }
  }
  
  /**
   * Add a route
   */
  private addRoute(method: HttpMethod, path: string, handler: Handler<TState>): this {
    const fullPath = this.prefix + path
    
    this.routes.push({
      method,
      path: fullPath,
      handler,
      middlewares: [...this.middlewares],
    })
    
    return this
  }
}

// ============================================================================
// Exports
// ============================================================================

export default Router
