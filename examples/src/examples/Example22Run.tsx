import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example22Run() {
  return (
    <ExampleRunner
      tag="Example 22"
      title="Vitamin Run"
      description="Add a dependency and inspect the updated manifest."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const registry = `${location.origin}/npm`

        const container = await createVitaminContainer({
          allowedHosts: ['api.github.com', 'httpbin.org'],
          serviceWorkerUrl: new URL('../../service-worker.ts', import.meta.url).toString(),      
          env: {
            BUN_INSTALL_REGISTRY: registry,
          },
          files: {
            '/index.ts': `
              debugger
              console.log('isEven(4)')
              console.log('isEven(5)')
            `,
            '/package.json': JSON.stringify({
              name: 'demo-bun-add',
              version: '0.0.0',
              dependencies: {},
            }, null, 2,),
          },
        })

        const result1 = await container.exec('vitamin', ['add', 'is-even'])
        log(result1.stdout || '')
        log(result1.stderr || '')

        const result2 = await container.exec('vitamin', ['run', 'index.ts'])
        log(result2.stdout || '')
        log(result2.stderr || '')
      }}
    />
  )
}

function base64ToText(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}
