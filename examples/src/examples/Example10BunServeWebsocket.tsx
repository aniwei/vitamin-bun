import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example10BunServeWebsocket() {
  return (
    <ExampleRunner
      tag="Example 10"
      title="Bun.serve WebSocket"
      description="Best-effort WebSocket proxy in the browser runtime."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createBunContainer({
          serviceWorkerUrl: new URL('../../service-worker.ts', import.meta.url).toString(),
          files: {
            '/server.ts': `
              Bun.serve({
                port: 3003,
                fetch() {
                  return new Response('WebSocket relay is best-effort in the browser runtime', { status: 426 })
                },
              })
            `,
          },
        })

        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        await new Promise((r) => setTimeout(r, 500))

        try {
          const ws = new WebSocket('ws://localhost:3003')
          ws.onopen = () => {
            log('WebSocket connected')
            ws.send('ping')
          }
          ws.onerror = () => {
            log('WebSocket failed (expected in some browsers)')
          }
        } catch {
          log('WebSocket not available')
        }

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
