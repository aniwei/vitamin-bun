import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example17PluginLifecycle() {
  return (
    <ExampleRunner
      tag="Example 17"
      title="Plugin Lifecycle"
      description="Runtime init/dispose and module resolution hooks."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')
        const container = await createVitaminContainer({
          files: {
            '/index.ts': `
              Bun.plugin({
                name: 'lifecycle-demo',
                priority: 10,
                onRuntimeInit() {
                  console.log('plugin init')
                },
                onRuntimeDispose() {
                  console.log('plugin dispose')
                },
                onModuleResolve(_ctx, id) {
                  if (id === 'alias:utils') {
                    return { id: '/utils.ts', stop: true }
                  }
                },
                onModuleRequest(_ctx, id) {
                  if (id === '/utils.ts') {
                    return { exports: { message: 'hello from plugin' } }
                  }
                },
              })

              const utils = require('alias:utils')
              console.log('utils', utils.message)
              console.log('plugins', Bun.plugins.map((p) => p.name).join(','))
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
