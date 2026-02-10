import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example05NetworkSandbox() {
  return (
    <ExampleRunner
      tag="Example 05"
      title="Network Sandbox"
      description="Restrict network access and proxy localhost via Service Worker."
      run={async ({ log }) => {
        log('⏳ Booting container with network sandbox...')
        const container = await createBunContainer({
          allowedHosts: ['api.github.com', 'httpbin.org'],
          serviceWorkerUrl: new URL('../../service-worker.ts', import.meta.url).toString(),
          env: { NODE_ENV: 'production' },
          files: {
            '/server.ts': `
              const server = Bun.serve({
                port: 3000,
                fetch(req: Request): Response {
                  const url = new URL(req.url)
                  if (url.pathname === '/') return new Response('Hello from Vitamin Bun! 🚀')
                  if (url.pathname === '/json') {
                    return Response.json({ message: 'This server runs in your browser', timestamp: Date.now() })
                  }
                  return new Response('Not Found', { status: 404 })
                },
              })
              console.log(\`Server running on port \${server.port}\`)
            `,
            '/fetch-test.ts': `
              try {
                const res = await fetch('https://httpbin.org/get')
                console.log('✅ httpbin.org response status:', res.status)
              } catch (e) {
                console.error('❌ httpbin.org request failed:', e)
              }
            `,
          },
        })

        log('✅ Container ready')
        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        serverProc.stdout.on('data', (data: Uint8Array) => {
          log('[server] ' + new TextDecoder().decode(data).trim())
        })
        await new Promise((r) => setTimeout(r, 1000))

        try {
          const res1 = await fetch('http://localhost:3000/')
          log(`GET /: ${await res1.text()}`)
          const res2 = await fetch('http://localhost:3000/json')
          log(`GET /json: ${JSON.stringify(await res2.json())}`)
        } catch {
          log('(Service Worker not active — requests may fail in dev)')
        }

        const fetchResult = await container.exec('bun', ['run', '/fetch-test.ts'])
        log('\n--- fetch output ---')
        log(fetchResult.stdout)

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
