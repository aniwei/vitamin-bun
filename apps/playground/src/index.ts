/**
 * vitamin-bun Playground
 * 
 * Development playground for testing vitamin-bun features
 */

import { Application } from '@vitamin-bun/core'
import { Router } from '@vitamin-bun/router'
import { Server } from '@vitamin-bun/server'

// Create application
const app = new Application()

// Create router
const router = new Router()

// Define routes
router.get('/', (ctx) => {
  console.log('GET /')
  // ctx.json({ message: 'Welcome to vitamin-bun!' })
})

router.get('/hello', (ctx) => {
  console.log('GET /hello')
  // ctx.json({ message: 'Hello, vitamin!' })
})

router.get('/users/:id', (ctx) => {
  console.log('GET /users/:id')
  // const { id } = ctx.params
  // ctx.json({ id, name: 'User' })
})

// Add middleware
app.use(async (ctx, next) => {
  const start = Date.now()
  console.log(`[${new Date().toISOString()}] ${ctx.method} ${ctx.path}`)
  await next()
  const duration = Date.now() - start
  console.log(`[${new Date().toISOString()}] Completed in ${duration}ms`)
})

// Use router
app.use(router.routes())

// Error handling
app.onError((err, ctx) => {
  console.error('Error:', err)
  // ctx.status = 500
  // ctx.json({ error: err.message })
})

// Create server
const server = new Server({
  port: 3000,
  development: true,
})

// Start server
console.log('Starting vitamin-bun playground...')
server.start()

// Listen
app.listen(3000)
