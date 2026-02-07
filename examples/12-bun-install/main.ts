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

  const snapshot = await container.fs.save()
  const encoded = snapshot.files['/node_modules/is-even/package.json']
  if (!encoded) {
    output.textContent += '\nPackage not found in snapshot.\n'
  } else {
    const installed = base64ToText(encoded)
    output.textContent += `\nInstalled package.json:\n${installed}\n`
  }

  await container.destroy()
})

function base64ToText(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return new TextDecoder().decode(bytes)
}
