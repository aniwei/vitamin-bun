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
          port: 3002,
          fetch() {
            const encoder = new TextEncoder()
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode('chunk-1\n'))
                controller.enqueue(encoder.encode('chunk-2\n'))
                controller.close()
              },
            })
            return new Response(stream)
          },
        })
      `,
    },
  })

  const serverProc = container.spawn('bun', ['run', '/server.ts'])
  await new Promise((r) => setTimeout(r, 500))

  const res = await fetch('http://localhost:3002/')
  const reader = res.body?.getReader()
  const decoder = new TextDecoder()
  let text = ''
  if (reader) {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (value) text += decoder.decode(value, { stream: true })
    }
  }
  output.textContent += text

  serverProc.kill()
  await container.destroy()
})
