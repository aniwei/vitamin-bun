import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example11BunServeTls() {
  return (
    <ExampleRunner
      tag="Example 11"
      title="Bun.serve TLS"
      description="Fetch HTTPS traffic proxied by the Service Worker."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createVitaminContainer({
          serviceWorkerUrl: new URL('../../service-worker.ts', import.meta.url).toString(),
          files: {
            '/server.ts': `
              Bun.serve({
                port: 3443,
                fetch() {
                  return new Response('TLS proxy mode (https forwarded by SW)')
                },
              })
            `,
          },
        })

        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        await new Promise((r) => setTimeout(r, 500))

        try {
          const res = await fetch('https://localhost:3443/')
          log(await res.text())
        } catch (err) {
          log(`Fetch failed: ${String(err)}`)
        }

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
