/**
 * Example 02 — Virtual Filesystem
 *
 * Demonstrates the container's filesystem API:
 * - Write / read files at runtime
 * - Create directories
 * - List directory contents
 * - Mount a project structure in bulk
 */
import { createBunContainer, type BunContainer } from '@vitamin-ai/sdk'

async function main() {
  console.log('⏳ Booting container…')

  const container = await createBunContainer({
  })

  console.log('✅ Container ready\n')

  // ── Write & read files ──────────────────────────────────────

  await container.fs.writeFile('/hello.txt', 'Hello, virtual world!')
  const content = await container.fs.readFile('/hello.txt', 'utf-8')
  console.log('Read /hello.txt:', content)

  // ── Create nested directory structure ───────────────────────

  await container.fs.mkdir('/project/src/components')
  console.log('Created /project/src/components')

  // ── Mount a batch of files (like a mini project) ────────────

  await container.mount('/project', {
    'package.json': JSON.stringify({
      name: 'my-app',
      version: '1.0.0',
      dependencies: {},
    }, null, 2),
    'src/index.ts': `
      import { greet } from './utils'
      console.log(greet('World'))
    `,
    'src/utils.ts': `
      export function greet(name: string): string {
        return \`Hello, \${name}!\`
      }
    `,
    'src/components/Button.tsx': `
      export function Button({ label }: { label: string }) {
        return <button>{label}</button>
      }
    `,
  })

  // ── List directory contents ─────────────────────────────────

  const rootEntries = await container.fs.readdir('/project')
  console.log('/project contents:', rootEntries)

  const srcEntries = await container.fs.readdir('/project/src')
  console.log('/project/src contents:', srcEntries)

  // ── Check existence & delete ────────────────────────────────

  console.log('/hello.txt exists?', await container.fs.exists('/hello.txt'))

  await container.fs.unlink('/hello.txt')
  console.log('/hello.txt exists after unlink?', await container.fs.exists('/hello.txt'))

  // ── Execute the mounted project ─────────────────────────────

  const result = await container.exec('bun', ['run', '/project/src/index.ts'])
  console.log('\n--- exec output ---')
  console.log('stdout:', result.stdout)
  console.log('exit code:', result.exitCode)

  await container.destroy()
  console.log('\n🏁 Done')
}

main().catch(console.error)
