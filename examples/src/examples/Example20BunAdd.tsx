import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example20BunAdd() {
  return (
    <ExampleRunner
      tag="Example 20"
      title="Bun Add"
      description="Add a dependency and inspect the updated manifest."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const registry = `${location.origin}/npm`

        const container = await createBunContainer({
          env: {
            BUN_INSTALL_REGISTRY: registry,
          },
          files: {
            '/package.json': JSON.stringify(
              {
                name: 'demo-bun-add',
                version: '0.0.0',
                dependencies: {},
              },
              null,
              2,
            ),
          },
        })

        const result = await container.exec('bun', ['add', 'is-even'])
        log(result.stdout || '')
        log(result.stderr || '')

        const snapshot = await container.fs.save()
        const manifest = snapshot.files['/package.json']
        const installed = snapshot.files['/node_modules/is-even/package.json']
        const lockfile = snapshot.files['/bun.lock']

        log('\n--- Snapshot ---')
        log(manifest ? 'package.json updated' : 'package.json missing')
        log(installed ? 'is-even installed' : 'is-even missing')
        log(lockfile ? 'bun.lock written' : 'bun.lock missing')

        if (manifest) {
          log('\npackage.json:')
          log(base64ToText(manifest))
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
