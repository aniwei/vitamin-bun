import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example03SpawnProcess() {
  return (
    <ExampleRunner
      tag="Example 03"
      title="Spawn Process"
      description="Spawn a long-running process and stream output."
      run={async ({ log, appendOutput }) => {
        const container = await createBunContainer({
          files: {
            '/repl.ts': `
              const decoder = new TextDecoder()
              process.stdout.write('vitamin> ')
              for await (const chunk of Bun.stdin.stream()) {
                const input = decoder.decode(chunk).trim()
                if (input === 'exit') {
                  console.log('Bye!')
                  process.exit(0)
                }
                try {
                  const result = eval(input)
                  console.log(result)
                } catch (e) {
                  console.error(String(e))
                }
                process.stdout.write('vitamin> ')
              }
            `,
          },
        })

        log('Spawned process...')
        const proc = container.spawn('bun', ['run', '/repl.ts'])
        proc.stdout.on('data', (data: Uint8Array) => {
          appendOutput(new TextDecoder().decode(data))
        })
        proc.stderr.on('data', (data: Uint8Array) => {
          appendOutput(new TextDecoder().decode(data))
        })

        await sleep(500)
        proc.writeStdin('1 + 2\n')
        await sleep(200)
        proc.writeStdin('"Hello".toUpperCase()\n')
        await sleep(200)
        proc.writeStdin('Math.PI\n')
        await sleep(200)
        proc.writeStdin('exit\n')

        const exitCode = await proc.exited
        log(`\nProcess exited with code: ${exitCode}`)
        await container.dispose()
      }}
    />
  )
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
