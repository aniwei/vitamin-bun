import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example14HonoServer() {
  return (
    <ExampleRunner
      tag="Example 14"
      title="Hono Server"
      description="Install Hono and serve routes through Bun.serve."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const registry = `${location.origin}/npm`

        const container = await createVitaminContainer({
          serviceWorkerUrl: new URL('../../vitamin-service-worker.ts', import.meta.url).toString(),
          env: {
            BUN_INSTALL_REGISTRY: registry,
          },
          files: {
            '/package.json': JSON.stringify(
              {
                name: 'hono-demo',
                version: '0.0.0',
                type: 'module',
                dependencies: {
                  hono: '^4.6.0',
                },
              },
              null,
              2,
            ),
            '/server.ts': `
              import { Hono } from 'hono'

              const app = new Hono()

              app.get('/', (c) => c.text('Hello from Hono'))
              app.get('/json', (c) => c.json({ ok: true, at: Date.now() }))

              const server = Bun.serve({
                port: 3000,
                fetch: app.fetch,
              })

              console.log('Hono server listening on', server.port)
            `,
          },
        })

        log('Running bun install...')
        const install = await container.exec('bun', ['install'])
        log(install.stdout || '')
        log(install.stderr || '')

        const serverProc = container.spawn('bun', ['run', '/server.ts'])
        const decoder = new TextDecoder()
        serverProc.stdout.on('data', (chunk: Uint8Array) => {
          log(decoder.decode(chunk))
        })
        serverProc.stderr.on('data', (chunk: Uint8Array) => {
          log(decoder.decode(chunk))
        })

        await new Promise((r) => setTimeout(r, 800))

        const textRes = await fetch('http://localhost:3000/')
        log(`GET / -> ${await textRes.text()}`)

        const jsonRes = await fetch('http://localhost:3000/json')
        log(`GET /json -> ${await jsonRes.text()}`)

        serverProc.kill()
        await container.dispose()
      }}
    />
  )
}
