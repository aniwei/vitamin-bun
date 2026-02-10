import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createBunContainer, type Container } from '@vitamin-ai/sdk'
import { ExampleLayout } from '../components/ExampleLayout'

const DEFAULT_CODE = `// Try editing this code and clicking "Run"

interface User {
  name: string
  age: number
}

function greet(user: User): string {
  return \`👋 Hello, \${user.name}! You are \${user.age} years old.\`
}

const users: User[] = [
  { name: 'Alice', age: 30 },
  { name: 'Bob', age: 25 },
  { name: 'Charlie', age: 35 },
]

for (const user of users) {
  console.log(greet(user))
}

console.log(\`\\nTotal users: \${users.length}\`)
`

export function Example04CodeEditor() {
  const [output, setOutput] = useState('Waiting for runtime...')
  const [status, setStatus] = useState('Loading...')
  const [running, setRunning] = useState(false)
  const editorRef = useRef<HTMLTextAreaElement | null>(null)
  const containerRef = useRef<Container | null>(null)

  useEffect(() => {
    const init = async () => {
      setStatus('⏳ Loading runtime...')
      try {
        containerRef.current = await createBunContainer({ env: { NO_COLOR: '1' } })
        setStatus('✅ Ready')
      } catch (err) {
        setStatus('❌ Failed to load runtime')
        setOutput(String(err))
      }
    }
    void init()
  }, [])

  const run = useCallback(async () => {
    const container = containerRef.current
    if (!container || !editorRef.current) return
    setRunning(true)
    setStatus('⚡ Running...')
    setOutput('')

    await container.fs.writeFile('/playground.ts', editorRef.current.value)
    const result = await container.exec('bun', ['run', '/playground.ts'])

    let text = ''
    if (result.stdout) text += result.stdout
    if (result.stderr) text += `\n⚠️ stderr:\n${result.stderr}`
    text += `\n\n[exit code: ${result.exitCode}]`
    setOutput(text)
    setStatus(result.exitCode === 0 ? '✅ Success' : '⚠️ Error')
    setRunning(false)
  }, [])

  return (
    <ExampleLayout
      tag="Example 04"
      title="Code Editor"
      description="Edit and run TypeScript in a browser-based Bun container."
      actions={
        <button className="primary-btn" onClick={run} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
      }
    >
      <div className="editor-layout">
        <div className="editor-box">
          <div className="editor-header">Editor ({status})</div>
          <div className="editor-body">
            <textarea ref={editorRef} className="editor-textarea" defaultValue={DEFAULT_CODE} />
          </div>
        </div>
        <div className="editor-box">
          <div className="editor-header">Output</div>
          <div className="editor-body">
            <pre className="output">{output}</pre>
          </div>
        </div>
      </div>
    </ExampleLayout>
  )
}
