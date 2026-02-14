import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example09BunServeStreaming() {
  return (
    <ExampleRunner
      tag="Example 09"
      title="Bun.serve Streaming"
      description="Stream response chunks from Bun.serve."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createVitaminContainer({
          serviceWorkerUrl: new URL('../../vitamin-service-worker.ts', import.meta.url).toString(),
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
        log(text.trim())

        serverProc.kill()
        await container.dispose()
        log('🏁 Done')
      }}
    />
  )
}
