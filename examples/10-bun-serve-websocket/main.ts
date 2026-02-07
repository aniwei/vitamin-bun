import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = '⏳ Booting container...\n'

  const container = await createBunContainer({
    serviceWorkerUrl: new URL('../service-worker.ts', import.meta.url).toString(),
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
      output.textContent += 'WebSocket connected\n'
      ws.send('ping')
    }
    ws.onerror = () => {
      output.textContent += 'WebSocket failed (expected in some browsers)\n'
    }
  } catch {
    output.textContent += 'WebSocket not available\n'
  }

  serverProc.kill()
  await container.destroy()
})
