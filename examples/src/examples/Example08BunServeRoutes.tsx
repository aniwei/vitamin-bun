import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example08BunServeRoutes() {
  return (
    <ExampleRunner
      tag="Example 08"
      title="Bun.serve Routes"
      description="Serve multiple routes with custom headers."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createVitaminContainer({
          serviceWorkerUrl: new URL('../../vitamin-service-worker.ts', import.meta.url).toString(),
          files: {
            '/server.ts': `
              Bun.serve({
                port: 3001,
                fetch(req) {
                  const url = new URL(req.url)
                  if (url.pathname === '/hello') {
                    return new Response('hello', { headers: { 'x-demo': 'routes' } })
                  }
                  if (url.pathname === '/json') {
                    return Response.json({ ok: true })
                  }
                  return new Response('Not Found', { status: 404 })
                },
              })
            `,
          },
        })

        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        await new Promise((r) => setTimeout(r, 500))

        const res1 = await fetch('http://localhost:3001/hello')
        log(`GET /hello: ${await res1.text()}`)
        log(`x-demo: ${res1.headers.get('x-demo')}`)

        const res2 = await fetch('http://localhost:3001/json')
        log(`GET /json: ${JSON.stringify(await res2.json())}`)

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
