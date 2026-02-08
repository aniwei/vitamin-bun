import React, { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBunContainer } from '@vitamin-ai/sdk'

const App = () => {
  const [output, setOutput] = useState('Ready')
  const [busy, setBusy] = useState(false)

  const run = async () => {
    setBusy(true)
    setOutput('⏳ Booting container…')

    const container = await createBunContainer({
      files: {
        '/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React (BunContainer)</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
        '/src/main.tsx': `import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'

createRoot(document.getElementById('root')!).render(<App />)
`,
        '/src/App.tsx': `export default function App() {
  return (
    <main style={{ fontFamily: 'system-ui', padding: 24 }}>
      <h1>Vite + React (BunContainer)</h1>
      <p>Files are written into BunContainer and verified by bun run.</p>
    </main>
  )
}
`,
        '/package.json': `{
  "name": "vite-react-container",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.3.3",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "typescript": "^5.7.0",
    "vite": "^6.0.0"
  }
}
`,
        '/vite.config.ts': `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
})
`,
        '/tsconfig.json': `{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
`,
        '/src/vite-env.d.ts': `/// <reference types="vite/client" />
`,
        '/public/robots.txt': `User-agent: *
      Disallow:
      `,
        '/public/placeholder.txt': `This is a public asset served by Vite.
      `,
        '/verify.ts': `(async () => {
        const html = await Bun.file('/index.html').text()
        const app = await Bun.file('/src/App.tsx').text()
        console.log('index.html bytes:', html.length)
        console.log('App.tsx bytes:', app.length)
        console.log('App.tsx has title:', app.includes('Vite + React'))
      })()
      `,
      },
      env: { NODE_ENV: 'development', BUN_INSTALL_REGISTRY: '/npm' },
    })

      setOutput('✅ Container ready\n\nInstalling dependencies…')

      const progressPrefix = '__BUN_INSTALL_PROGRESS__ '
      const decoder = new TextDecoder()
      let installStdout = ''
      let installStderr = ''
      let installBuffer = ''
      let installProgress = ''

      const renderInstallOutput = (exitCode?: number) => {
        let text = '✅ Container ready\n\nInstalling dependencies…'
        if (installProgress) {
          text += `\n${installProgress}`
        }
        text += `\n\n--- bun install stdout ---\n${installStdout}\n`
        if (installStderr) {
          text += `--- bun install stderr ---\n${installStderr}\n`
        }
        if (exitCode !== undefined) {
          text += `\nInstall exit code: ${exitCode}\n`
        }
        setOutput(text)
        return text
      }

      const installProc = container.spawn('bun', ['install'])
      installProc.stdout.on('data', (chunk) => {
        installBuffer += decoder.decode(chunk)
        let newlineIndex = installBuffer.indexOf('\\n')
        while (newlineIndex >= 0) {
          const line = installBuffer.slice(0, newlineIndex)
          installBuffer = installBuffer.slice(newlineIndex + 1)

          if (line.startsWith(progressPrefix)) {
            const payloadRaw = line.slice(progressPrefix.length)
            try {
              const payload = JSON.parse(payloadRaw) as {
                type?: string
                phase?: string
                name?: string
                version?: string
                total?: number
                installed?: number
                percent?: number
                received?: number
                message?: string
              }
              if (payload.type === 'count') {
                installProgress = `Packages: ${payload.installed ?? 0}/${payload.total ?? 0}`
              } else if (payload.type === 'download') {
                const name = payload.name ?? 'package'
                const label = payload.version ? `${name}@${payload.version}` : name
                const percent =
                  payload.percent ??
                  (payload.received !== undefined && payload.total !== undefined
                    ? (payload.received / payload.total) * 100
                    : undefined)
                const pctText = percent !== undefined ? ` (${percent.toFixed(1)}%)` : ''
                installProgress = `Downloading ${label}${pctText}`
              } else if (payload.type === 'progress') {
                const name = payload.name ?? 'package'
                const label = payload.version ? `${name}@${payload.version}` : name
                const phase = payload.phase ?? 'working'
                const message = payload.message ? ` — ${payload.message}` : ''
                installProgress = `${phase}: ${label}${message}`
              }
            } catch {
              installStdout += `${line}\n`
            }
          } else if (line.length > 0) {
            installStdout += `${line}\n`
          }

          newlineIndex = installBuffer.indexOf('\\n')
        }
        renderInstallOutput()
      })
      installProc.stderr.on('data', (chunk) => {
        installStderr += decoder.decode(chunk)
        renderInstallOutput()
      })

      const installExitCode = await installProc.exited
      if (installBuffer.trim()) {
        installStdout += `${installBuffer.trim()}\n`
      }

      let text = renderInstallOutput(installExitCode)

      if (installExitCode !== 0) {
        await container.destroy()
        setBusy(false)
        return
      }

      setOutput(text + '\nStarting dev server (short preview)…')
      let devStdout = ''
      let devStderr = ''
      const proc = container.spawn('bun', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'])
      proc.stdout.on('data', (chunk) => {
        devStdout += decoder.decode(chunk)
      })
      proc.stderr.on('data', (chunk) => {
        devStderr += decoder.decode(chunk)
      })

      await new Promise((resolve) => setTimeout(resolve, 1500))

      text += `\n--- dev stdout ---\n${devStdout}\n`
      if (devStderr) {
        text += `--- dev stderr ---\n${devStderr}\n`
      }
      text += '\n(Dev server keeps running in this demo.)'

      setOutput(text)
      setBusy(false)
  }

  return (
    <div className="card">
      <h1>Example 18 — Vite + React</h1>
      <p className="muted">基于 BunContainer 的 Vite + React 示例，执行脚本并展示 stdout/stderr。</p>
      <div className="row">
        <button onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run'}</button>
      </div>
      <pre>{output}</pre>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
