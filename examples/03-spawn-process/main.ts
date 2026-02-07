/**
 * Example 03 — Long-Running Process (spawn)
 *
 * Demonstrates `container.spawn()` for streaming I/O:
 * - Spawn a process that runs continuously
 * - Stream stdout/stderr in real-time
 * - Write to stdin interactively
 * - Kill the process when done
 */
import { createBunContainer } from '@vitamin-ai/sdk'

async function main() {
  const container = await createBunContainer({
    files: {
      '/repl.ts': `
        // A simple REPL that evaluates expressions from stdin
        const decoder = new TextDecoder()

        process.stdout.write('vitamin> ')

        for await (const chunk of Bun.stdin.stream()) {
          const input = decoder.decode(chunk).trim()

          if (input === 'exit') {
            console.log('Bye!')
            process.exit(0)
          }

          try {
            const result = eval(input)
            console.log(result)
          } catch (e) {
            console.error(String(e))
          }

          process.stdout.write('vitamin> ')
        }
      `,
    },
  })

  // ── Spawn a long-running process ────────────────────────────

  const proc = container.spawn('bun', ['run', '/repl.ts'])
  console.log(`Spawned process PID: ${proc.pid}`)

  // Stream stdout in real-time
  proc.stdout.on('data', (data: Uint8Array) => {
    console.log(new TextDecoder().decode(data))
  })

  // Stream stderr in real-time
  proc.stderr.on('data', (data: Uint8Array) => {
    console.error(new TextDecoder().decode(data))
  })

  // ── Send commands to stdin ──────────────────────────────────

  // Wait a bit for the REPL to boot
  await sleep(500)

  proc.writeStdin('1 + 2\n')
  await sleep(200)

  proc.writeStdin('"Hello".toUpperCase()\n')
  await sleep(200)

  proc.writeStdin('Math.PI\n')
  await sleep(200)

  // Graceful exit
  proc.writeStdin('exit\n')

  // ── Wait for the process to finish ──────────────────────────

  const exitCode = await proc.exited
  console.log(`\nProcess exited with code: ${exitCode}`)

  await container.destroy()
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

main().catch(console.error)
