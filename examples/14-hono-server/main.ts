import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

const decoder = new TextDecoder()

runBtn.addEventListener('click', async () => {
  output.textContent = 'Booting container...\n'

  const registry = `${location.origin}/npm`

  const container = await createBunContainer({
    serviceWorkerUrl: new URL('../service-worker.ts', import.meta.url).toString(),
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

  output.textContent += 'Running bun install...\n'
  const install = await container.exec('bun', ['install'])
  output.textContent += install.stdout || ''
  output.textContent += install.stderr || ''

  const serverProc = container.spawn('bun', ['run', '/server.ts'])
  serverProc.stdout.on('data', (chunk) => {
    output.textContent += decoder.decode(chunk)
  })
  serverProc.stderr.on('data', (chunk) => {
    output.textContent += decoder.decode(chunk)
  })

  await new Promise((r) => setTimeout(r, 800))

  const textRes = await fetch('http://localhost:3000/')
  output.textContent += `\nGET / -> ${await textRes.text()}\n`

  const jsonRes = await fetch('http://localhost:3000/json')
  output.textContent += `GET /json -> ${await jsonRes.text()}\n`

  serverProc.kill()
  await container.destroy()
})
