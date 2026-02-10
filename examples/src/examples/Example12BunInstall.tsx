import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example12BunInstall() {
  return (
    <ExampleRunner
      tag="Example 12"
      title="Bun Install"
      description="Install a package via the browser proxy registry."
      run={async ({ log, setOutput }) => {
        setOutput('⏳ Booting container...\n')
        const registry = `${location.origin}/npm`

        const container = await createBunContainer({
          env: {
            BUN_INSTALL_REGISTRY: registry,
          },
          files: {
            '/package.json': JSON.stringify(
              {
                name: 'demo-bun-install',
                version: '0.0.0',
                dependencies: {
                  'is-even': '^1.0.0',
                },
              },
              null,
              2,
            ),
          },
        })

        const result = await container.exec('bun', ['install'])
        log(result.stdout || '')
        log(result.stderr || '')

        const snapshot = await container.fs.save()
        const encoded = snapshot.files['/node_modules/is-even/package.json']
        if (!encoded) {
          log('\nPackage not found in snapshot.')
        } else {
          const installed = base64ToText(encoded)
          log(`\nInstalled package.json:\n${installed}`)
        }

        await container.dispose()
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
