import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createVitaminContainer, type Container } from '@vitamin-ai/sdk'
import { ExampleLayout } from '../components/ExampleLayout'

const FILES = [
  '/index.html',
  '/src/main.tsx',
  '/src/App.tsx',
  '/package.json',
  '/vite.config.ts',
  '/tsconfig.json',
  '/src/vite-env.d.ts',
  '/public/robots.txt',
  '/public/placeholder.txt',
  '/verify.ts',
]

export function Example18ViteReact() {
  const [output, setOutput] = useState('Ready')
  const [selectedPath, setSelectedPath] = useState('/src/App.tsx')
  const [editorValue, setEditorValue] = useState('')
  const [status, setStatus] = useState('Idle')
  const [installing, setInstalling] = useState(false)
  const [runningDev, setRunningDev] = useState(false)
  const containerRef = useRef<Container | null>(null)

  const ensureContainer = useCallback(async (): Promise<Container> => {
    if (containerRef.current) return containerRef.current
    setStatus('⏳ Booting container...')
    const container = await createVitaminContainer({
      files: {
        '/index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vite + React (Container)</title>
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
      <h1>Vite + React (Container)</h1>
      <p>Files are written into a container and verified by bun run.</p>
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
      env: { NODE_ENV: 'development', BUN_INSTALL_REGISTRY: `${location.origin}/npm` },
    })

    containerRef.current = container
    setStatus('✅ Container ready')
    return container
  }, [])

  const loadFile = useCallback(async (path: string) => {
    const container = await ensureContainer()
    if (!(await container.fs.exists(path))) {
      setEditorValue('// File missing')
      return
    }
    const text = await container.fs.readFile(path, 'utf-8')
    setEditorValue(String(text))
  }, [ensureContainer])

  useEffect(() => {
    void loadFile(selectedPath)
  }, [loadFile, selectedPath])

  const handleSelect = (path: string) => {
    setSelectedPath(path)
  }

  const handleSave = async () => {
    const container = await ensureContainer()
    await container.fs.writeFile(selectedPath, editorValue)
    setOutput(`Saved ${selectedPath}`)
  }

  const handleInstall = async () => {
    const container = await ensureContainer()
    setInstalling(true)
    setOutput('Running bun install...')
    const result = await container.exec('bun', ['install'])
    setOutput((result.stdout || '') + (result.stderr || ''))
    setInstalling(false)
  }

  const handleRunDev = async () => {
    const container = await ensureContainer()
    setRunningDev(true)
    setOutput('Running dev server...')
    const proc = container.spawn('bun', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'])

    proc.stdout.on('data', (data: Uint8Array) => {
      const text = new TextDecoder().decode(data)
      setOutput((prev) => prev + text)
    })
    proc.stderr.on('data', (data: Uint8Array) => {
      const text = new TextDecoder().decode(data)
      setOutput((prev) => prev + text)
    })

    void proc.exited.then((code) => {
      setOutput((prev) => `${prev}\n[dev server exited with code ${code}]\n`)
      setRunningDev(false)
    })
  }

  const actions = useMemo(
    () => (
      <>
        <button className="primary-btn" onClick={handleInstall} disabled={installing}>
          {installing ? 'Installing…' : 'Install'}
        </button>
        <button className="primary-btn" onClick={handleRunDev} disabled={runningDev}>
          {runningDev ? 'Running…' : 'Run Dev Server'}
        </button>
      </>
    ),
    [handleInstall, handleRunDev, installing, runningDev],
  )

  return (
    <ExampleLayout
      tag="Example 18"
      title="Vite + React"
      description="Manage a Vite + React project inside the Bun container."
      actions={actions}
    >
      <div className="example18-layout">
        <div className="example18-panels">
          <div className="example18-panel">
            <div className="example18-panel-header">Files</div>
            <div className="example18-panel-body">
              <div className="file-list">
                {FILES.map((path) => (
                  <button
                    key={path}
                    type="button"
                    className={`file-chip${path === selectedPath ? ' is-active' : ''}`}
                    onClick={() => handleSelect(path)}
                  >
                    {path}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="example18-panel">
            <div className="example18-panel-header">Editor</div>
            <div className="example18-panel-body">
              <textarea
                className="editor-textarea"
                value={editorValue}
                onChange={(event) => setEditorValue(event.target.value)}
              />
              <div style={{ marginTop: 12 }}>
                <button className="primary-btn" onClick={handleSave}>
                  Save File
                </button>
                <span style={{ marginLeft: 12, color: 'var(--muted)' }}>{status}</span>
              </div>
            </div>
          </div>
        </div>
        <div className="example18-panel">
          <div className="example18-panel-header">Output</div>
          <div className="example18-panel-body">
            <pre className="example18-output">{output}</pre>
          </div>
        </div>
      </div>
    </ExampleLayout>
  )
}
