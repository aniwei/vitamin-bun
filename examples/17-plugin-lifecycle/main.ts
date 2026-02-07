import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = 'Booting container...\n'

  const container = await createBunContainer({
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
          onModuleLoad(_ctx, id) {
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
  output.textContent += result.stdout || ''
  output.textContent += result.stderr || ''

  await container.destroy()
})
