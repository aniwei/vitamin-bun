import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { createBunContainer, type BunContainer } from '@vitamin-ai/sdk'
import Editor, { loader } from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import { Tree, type NodeApi } from 'react-arborist'

type TreeNode = {
  name: string
  path: string
  id: string
  kind: 'file' | 'directory'
  children: TreeNode[]
}

const App = () => {
  const [output, setOutput] = useState('Ready')
  const [tree, setTree] = useState<TreeNode[]>([])
  const [selectedPath, setSelectedPath] = useState('/src/App.tsx')
  const [editorValue, setEditorValue] = useState('// Select a file from the tree')
  const [devStatus, setDevStatus] = useState<'idle' | 'running' | 'pending'>('idle')
  const [treeHeight, setTreeHeight] = useState(360)
  const [treeWidth, setTreeWidth] = useState(320)
  const treeContainerRef = useRef<HTMLDivElement | null>(null)
  const [status, setStatus] = useState('Idle')
  const [installing, setInstalling] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [devRunning, setDevRunning] = useState(false)
  const containerRef = useRef<BunContainer | null>(null)
  const decoderRef = useRef(new TextDecoder())
  const treeMapRef = useRef(new Map<string, 'file' | 'directory'>())
  const treeTimerRef = useRef<number | null>(null)

  useEffect(() => {
    loader.config({ monaco })
  }, [])

  const ensureContainer = async (): Promise<BunContainer> => {
    if (containerRef.current) return containerRef.current
    setStatus('⏳ Booting container…')
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
      onVfsCreate: (event) => {
        treeMapRef.current.set(event.path, event.kind)
        scheduleTreeRender()
      },
      onVfsDelete: (event) => {
        treeMapRef.current.delete(event.path)
        scheduleTreeRender()
      },
      onVfsMove: (event) => {
        const kind = treeMapRef.current.get(event.from) ?? event.kind
        treeMapRef.current.delete(event.from)
        treeMapRef.current.set(event.to, kind)
        scheduleTreeRender()
      },
    })

    containerRef.current = container
    seedTreeFromFiles()
    scheduleTreeRender()
    void loadFile(selectedPath)
    setStatus('✅ Container ready')
    return container
  }

  const updateTreeHeight = () => {
    const height = treeContainerRef.current?.clientHeight ?? 360
    const width = treeContainerRef.current?.clientWidth ?? 320
    setTreeHeight(Math.max(240, height))
    setTreeWidth(Math.max(240, width))
  }

  useEffect(() => {
    updateTreeHeight()
    const handleResize = () => updateTreeHeight()
    window.addEventListener('resize', handleResize)
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => updateTreeHeight())
      : null
    if (observer && treeContainerRef.current) {
      observer.observe(treeContainerRef.current)
    }
    return () => {
      window.removeEventListener('resize', handleResize)
      observer?.disconnect()
    }
  }, [])

  const seedTreeFromFiles = () => {
    if (treeMapRef.current.size > 0) return
    const files = [
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
    for (const file of files) {
      treeMapRef.current.set(file, 'file')
      const parts = file.split('/').filter(Boolean)
      let current = ''
      for (let i = 0; i < parts.length - 1; i += 1) {
        current += `/${parts[i]}`
        if (!treeMapRef.current.has(current)) {
          treeMapRef.current.set(current, 'directory')
        }
      }
    }
  }

  const scheduleTreeRender = () => {
    if (treeTimerRef.current !== null) return
    treeTimerRef.current = window.setTimeout(() => {
      treeTimerRef.current = null
      setTree(buildTree(treeMapRef.current))
    }, 100)
  }

  const buildTree = (map: Map<string, 'file' | 'directory'>): TreeNode[] => {
    type Node = { name: string; path: string; kind: 'file' | 'directory'; children: Map<string, Node> }
    const root: Node = { name: '/', path: '/', kind: 'directory', children: new Map() }

    for (const [path, kind] of map.entries()) {
      const parts = path.split('/').filter(Boolean)
      let current = root
      parts.forEach((part, index) => {
        const isLeaf = index === parts.length - 1
        const nextKind: 'file' | 'directory' = isLeaf ? kind : 'directory'
        const nextPath = current.path === '/' ? `/${part}` : `${current.path}/${part}`
        let node = current.children.get(part)
        if (!node) {
          node = { name: part, path: nextPath, kind: nextKind, children: new Map() }
          current.children.set(part, node)
        }
        if (isLeaf) node.kind = nextKind
        current = node
      })
    }

    const toTree = (node: Node): TreeNode => {
      const children = Array.from(node.children.values())
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
          return a.name.localeCompare(b.name)
        })
        .map((child) => toTree(child))
      return { name: node.name, path: node.path, id: node.path, kind: node.kind, children }
    }

    return Array.from(root.children.values())
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
        return a.name.localeCompare(b.name)
      })
      .map((child) => toTree(child))
  }

  const loadFile = async (path: string) => {
    const container = containerRef.current
    if (!container) return
    const exists = await container.fs.exists(path)
    if (!exists) return
    const content = await container.fs.readFile(path, 'utf8')
    setEditorValue(typeof content === 'string' ? content : new TextDecoder().decode(content))
  }

  const treeData = useMemo(() => tree, [tree])

  const installDeps = async () => {
    if (installing) return
    setInstalling(true)
    setStatus('📦 Installing dependencies…')
    setOutput('⏳ Preparing install…')

    const container = await ensureContainer()

    const progressPrefix = '__BUN_INSTALL_PROGRESS__ '
    const decoder = decoderRef.current
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
      let newlineIndex = installBuffer.indexOf('\n')
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

        newlineIndex = installBuffer.indexOf('\n')
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

    renderInstallOutput(installExitCode)

    if (installExitCode === 0) {
      setInstalled(true)
      setStatus('✅ Dependencies installed')
    } else {
      setStatus('⚠️ Install failed')
    }
    setInstalling(false)
  }

  const runDev = async () => {
    if (devRunning || installing) return
    if (!installed) {
      setOutput('Please install dependencies first.')
      return
    }

    const container = await ensureContainer()
    setDevRunning(true)
    setDevStatus('pending')
    setStatus('🚀 Dev server running…')

    const decoder = decoderRef.current
    let devStdout = ''
    let devStderr = ''
    let devReady = false
    const proc = container.spawn('bun', ['run', 'dev', '--', '--host', '0.0.0.0', '--port', '5173'])
    proc.stdout.on('data', (chunk) => {
      devStdout += decoder.decode(chunk)
      if (!devReady && /VITE\s+v|Local:\s+http|Network:\s+http/i.test(devStdout)) {
        devReady = true
        setDevStatus('running')
        setStatus('✅ Dev script running')
      }
    })
    proc.stderr.on('data', (chunk) => {
      devStderr += decoder.decode(chunk)
    })

    await new Promise((resolve) => setTimeout(resolve, 1500))

    let text = `--- dev stdout ---\n${devStdout}\n`
    if (devStderr) {
      text += `--- dev stderr ---\n${devStderr}\n`
    }
    text += devReady
      ? '\n(Dev server keeps running in this demo.)'
      : '\n(Dev server may still be starting; check stdout.)'
    setOutput(text)
    if (!devReady) {
      setDevStatus('pending')
    }
  }

  return (
    <div className="app">
      <header>
        <h1>🧪 Example 18 — Vite + React</h1>
        <span id="status">{status}</span>
        <div className="actions">
          <button id="install-btn" onClick={installDeps} disabled={installing}>
            {installing ? 'Installing…' : '1) Install dependencies'}
          </button>
          <button id="dev-btn" onClick={runDev} disabled={installing || !installed || devRunning}>
            {devRunning ? 'Dev running…' : '2) Run dev'}
          </button>
        </div>
      </header>
      <div className="layout">
        <div className="panels panels--top">
          <div className="panel">
            <div className="panel-header">VFS Tree</div>
            <div className="panel-body">
              <div className="tree-container" ref={treeContainerRef}>
                <Tree
                  data={treeData}
                  width={treeWidth}
                  height={treeHeight}
                  rowHeight={26}
                  indent={16}
                  selection="single"
                  initialOpenState={{ '/src': true, '/public': true, '/node_modules': false }}
                  onSelect={(nodes: NodeApi<TreeNode>[]) => {
                    const node = nodes[0]
                    const data = node?.data
                    if (data?.kind === 'file') {
                      setSelectedPath(data.path)
                      void loadFile(data.path)
                    }
                  }}
                >
                  {({ node, style }: { node: NodeApi<TreeNode>; style: React.CSSProperties }) => (
                    <div style={style} className={`tree-row ${node.isSelected ? 'is-selected' : ''}`}>
                      <span className="tree-icon">{node.isLeaf ? '📄' : '📁'}</span>
                      <span className="tree-label">{node.data.name}</span>
                      {!node.isLeaf && <span className="tree-caret">{node.isOpen ? '▾' : '▸'}</span>}
                    </div>
                  )}
                </Tree>
              </div>
            </div>
          </div>
          <div className="panel">
            <div className="panel-header">Editor</div>
            <div className="panel-body panel-body--editor">
              <Editor
                height="100%"
                theme="vs-dark"
                language={selectedPath.endsWith('.ts') || selectedPath.endsWith('.tsx') ? 'typescript' : 'plaintext'}
                value={editorValue}
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollbar: { verticalScrollbarSize: 10 },
                }}
              />
            </div>
          </div>
        </div>
        <div className="panel panel--output">
          <div className="panel-header">Output</div>
          <pre id="output">{output}</pre>
        </div>
      </div>
    </div>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
