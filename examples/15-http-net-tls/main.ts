import { createBunContainer } from '@vitamin-ai/sdk'

const output = document.getElementById('output')!
const runBtn = document.getElementById('run')!

runBtn.addEventListener('click', async () => {
  output.textContent = 'Booting container...\n'

  const container = await createBunContainer({
    serviceWorkerUrl: new URL('../service-worker.ts', import.meta.url).toString(),
    allowedHosts: ['httpbin.org', 'example.com'],
    files: {
      '/client.ts': `
        const http = require('http')
        const net = require('net')
        const tls = require('tls')

        const decoder = new TextDecoder()

        await new Promise((resolve) => {
          http.get('http://httpbin.org/get', async (res) => {
            console.log('http status', res.statusCode)
            const text = await res.text()
            console.log('http body', text.slice(0, 120))
            resolve(null)
          }).on('error', (err) => {
            console.log('http error', String(err))
            resolve(null)
          })
        })

        await new Promise((resolve) => {
          const socket = net.connect({ host: 'example.com', port: 80 })
          socket.on('connect', () => {
            console.log('net connected')
            socket.write('GET / HTTP/1.1\\r\\nHost: example.com\\r\\nConnection: close\\r\\n\\r\\n')
          })
          socket.on('data', (chunk) => {
            console.log('net data', decoder.decode(chunk.slice(0, 120)))
          })
          socket.on('error', (err) => {
            console.log('net error', String(err))
          })
          socket.on('close', () => {
            console.log('net closed')
            resolve(null)
          })
          setTimeout(() => socket.end(), 1500)
        })

        await new Promise((resolve) => {
          const socket = tls.connect({ host: 'example.com', port: 443 })
          socket.on('secureConnect', () => {
            console.log('tls connected')
            socket.write('GET / HTTP/1.1\\r\\nHost: example.com\\r\\nConnection: close\\r\\n\\r\\n')
          })
          socket.on('data', (chunk) => {
            console.log('tls data', decoder.decode(chunk.slice(0, 120)))
          })
          socket.on('error', (err) => {
            console.log('tls error', String(err))
          })
          socket.on('close', () => {
            console.log('tls closed')
            resolve(null)
          })
          setTimeout(() => socket.end(), 1500)
        })
      `,
    },
  })

  const result = await container.exec('bun', ['run', '/client.ts'])
  output.textContent += result.stdout || ''
  output.textContent += result.stderr || ''

  await container.destroy()
})
