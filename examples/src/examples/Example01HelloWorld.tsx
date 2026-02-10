import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example01HelloWorld() {
  return (
    <ExampleRunner
      tag="Example 01"
      title="Hello World"
      description="Run a simple TypeScript script inside a Bun container."
      run={async ({ setOutput, appendOutput }) => {
        setOutput('⏳ Booting container...\n')
        const container = await createBunContainer({
          files: {
            '/index.ts': `
              const name: string = 'Vitamin Bun'
              console.log(\`Hello from \${name}! 🚀\`)
              console.log(\`Running in: \${typeof globalThis}\`)
              console.log(\`Date: \${new Date().toISOString()}\`)
            `,
          },
          env: {
            NODE_ENV: 'development',
          },
        })

        appendOutput('✅ Container ready\n\n')
        const result = await container.exec('bun', ['run', '/index.ts'])
        appendOutput(`--- stdout ---\n${result.stdout}\n`)
        if (result.stderr) {
          appendOutput(`--- stderr ---\n${result.stderr}\n`)
        }
        appendOutput(`\nExit code: ${result.exitCode}`)
        await container.dispose()
      }}
    />
  )
}
