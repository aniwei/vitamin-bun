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
    output.textContent += await res.text()
  } catch (err) {
    output.textContent += `Fetch failed: ${String(err)}`
  }

  serverProc.kill()
  await container.destroy()
})
