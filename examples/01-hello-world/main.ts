/**
 * Example 01 — Hello World
 *
 * Demonstrates the simplest possible usage of @vitamin-ai/sdk:
 * 1. Create a container with an inline TypeScript file
 * 2. Execute it with `bun run`
 * 3. Display the captured stdout
 */
import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = '⏳ Booting container…\n'

  // 1️⃣ Create a Bun container with initial files
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

  output.textContent += '✅ Container ready\n\n'

  // 2️⃣ Execute the script
  const result = await container.exec('bun', ['run', '/index.ts'])

  // 3️⃣ Display output
  output.textContent += `--- stdout ---\n${result.stdout}\n`
  if (result.stderr) {
    output.textContent += `--- stderr ---\n${result.stderr}\n`
  }
  output.textContent += `\nExit code: ${result.exitCode}`

  // 4️⃣ Clean up
  await container.destroy()
})
