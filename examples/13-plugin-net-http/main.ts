import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = '⏳ Booting container...\n'

  const container = await createBunContainer({
    files: {
      '/index.ts': `
        Bun.plugin({
          name: 'demo-net-http',
          priority: 100,
          onModuleLoad(_ctx, id) {
            if (id === 'net' || id === 'tls') {
              return {
                exports: {
                  connect() {
                    throw new Error('net/tls blocked by plugin')
                  },
                },
              }
            }
            if (id === 'http' || id === 'https') {
              return {
                exports: {
                  get(url, callback) {
                    const res = {
                      statusCode: 200,
                      headers: { 'x-plugin': '1' },
                      text: async () => 'plugin-response for ' + url,
                    }
                    callback?.(res)
                    return { end() {} }
                  },
                },
              }
            }
          },
        })

        const http = require('http')
        const net = require('net')

        const done = new Promise((resolve) => {
          http.get('https://example.com', async (res) => {
            console.log('http status', res.statusCode)
            console.log(await res.text())
            resolve(null)
          })
        })

        try {
          net.connect()
        } catch (err) {
          console.log('net blocked', String(err))
        }

        await done
      `,
    },
  })

  const result = await container.exec('bun', ['run', '/index.ts'])
  output.textContent += result.stdout || ''
  output.textContent += result.stderr || ''

  await container.destroy()
})
