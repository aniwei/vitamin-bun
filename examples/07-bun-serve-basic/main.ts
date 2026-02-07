import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = '⏳ Booting container...\n'

  const container = await createBunContainer({
    serviceWorkerUrl: new URL('../service-worker.ts', import.meta.url).toString(),
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
  serverProc.stdout.on('data', (chunk) => {
    output.textContent += new TextDecoder().decode(chunk)
  })

  await new Promise((r) => setTimeout(r, 500))

  const res = await fetch('http://localhost:3000/')
  output.textContent += `\nResponse: ${await res.text()}\n`

  serverProc.kill()
  await container.destroy()
})
