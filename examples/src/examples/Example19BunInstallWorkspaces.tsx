import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example19BunInstallWorkspaces() {
  return (
    <ExampleRunner
      tag="Example 19"
      title="Bun Install Workspaces"
      description="Install workspace and registry dependencies."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const registry = `${location.origin}/npm`

        const container = await createVitaminContainer({
          env: {
            BUN_INSTALL_REGISTRY: registry,
          },
          files: {
            '/package.json': JSON.stringify(
              {
                name: 'demo-workspaces',
                version: '0.0.0',
                workspaces: ['packages/*'],
                dependencies: {
                  'local-lib': 'workspace:*',
                  'is-even': '^1.0.0',
                },
              },
              null,
              2,
            ),
            '/packages/local-lib/package.json': JSON.stringify(
              {
                name: 'local-lib',
                version: '0.1.0',
                main: 'index.js',
              },
              null,
              2,
            ),
            '/packages/local-lib/index.js': 'module.exports = 7',
          },
        })

        const result = await container.exec('bun', ['install'])
        log(result.stdout || '')
        log(result.stderr || '')

        const snapshot = await container.fs.save()
        const localLib = snapshot.files['/node_modules/local-lib/index.js']
        const isEven = snapshot.files['/node_modules/is-even/package.json']
        const lockfile = snapshot.files['/bun.lock']

        log('\n--- Snapshot ---')
        log(localLib ? 'local-lib installed' : 'local-lib missing')
        log(isEven ? 'is-even installed' : 'is-even missing')
        log(lockfile ? 'bun.lock written' : 'bun.lock missing')

        if (isEven) {
          log('\nnode_modules/is-even/package.json:')
          log(base64ToText(isEven))
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
