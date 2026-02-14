import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example07BunServeBasic() {
  return (
    <ExampleRunner
      tag="Example 07"
      title="Bun.serve Basic"
      description="Start a Bun.serve server and fetch through the proxy."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createVitaminContainer({
          serviceWorkerUrl: new URL('../../vitamin-service-worker.ts', import.meta.url).toString(),
          files: {
            '/server.ts': `
              const server = Bun.serve({
                port: 3000,
                fetch() {
                  return new Response('Hello from Bun.serve')
                },
              })
              console.log('Bun.serve running on', server.port)
            `,
          },
        })

        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        serverProc.stdout.on('data', (chunk: Uint8Array) => {
          log(new TextDecoder().decode(chunk))
        })

        await new Promise((r) => setTimeout(r, 500))
        const res = await fetch('http://localhost:3000/')
        log(`Response: ${await res.text()}`)

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
