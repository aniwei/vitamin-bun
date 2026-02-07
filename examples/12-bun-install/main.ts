import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = '⏳ Booting container...\n'

  const registry = `${location.origin}/npm`

  const container = await createBunContainer({
    env: {
      BUN_INSTALL_REGISTRY: registry,
    },
    files: {
      '/package.json': JSON.stringify({
        name: 'demo-bun-install',
        version: '0.0.0',
        dependencies: {
          'is-even': '^1.0.0',
        },
      }, null, 2),
    },
  })

  const result = await container.exec('bun', ['install'])
  output.textContent += result.stdout || ''
  output.textContent += result.stderr || ''

  const installed = await container.fs.readFile('/node_modules/is-even/package.json', 'utf-8')
  output.textContent += `\nInstalled package.json:\n${installed}\n`

  await container.destroy()
})
