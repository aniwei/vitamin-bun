import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example16FileIo() {
  return (
    <ExampleRunner
      tag="Example 16"
      title="File IO"
      description="Write, read, and stream files with Bun.file."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const container = await createBunContainer({
          files: {
            '/index.ts': `
              await Bun.write('/note.txt', 'hello')
              console.log('text', await Bun.file('/note.txt').text())

              const bytes = await Bun.file('/note.txt').bytes()
              console.log('bytes', Array.from(bytes).join(','))

              const stream = Bun.file('/note.txt').stream()
              const reader = stream.getReader()
              const chunks = []
              while (true) {
                const { done, value } = await reader.read()
                if (done) break
                if (value) chunks.push(value)
              }
              const merged = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0))
              let offset = 0
              for (const chunk of chunks) {
                merged.set(chunk, offset)
                offset += chunk.byteLength
              }
              console.log('stream', new TextDecoder().decode(merged))

              const sink = Bun.file('/sink.txt').writer({ append: true })
              await sink.write('a')
              await sink.write('b')
              sink.close()
              console.log('sink', await Bun.file('/sink.txt').text())
            `,
          },
        })

        const result = await container.exec('bun', ['run', '/index.ts'])
        log(result.stdout || '')
        log(result.stderr || '')

        await container.dispose()
      }}
    />
  )
}
