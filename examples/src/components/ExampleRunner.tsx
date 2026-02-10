import React, { useCallback, useState } from 'react'
import { ExampleLayout } from './ExampleLayout'

export type ExampleRunHelpers = {
  setOutput: (text: string) => void
  appendOutput: (text: string) => void
  log: (text: string) => void
}

type ExampleRunnerProps = {
  tag: string
  title: string
  description: string
  run: (helpers: ExampleRunHelpers) => Promise<void>
}

export function ExampleRunner({ tag, title, description, run }: ExampleRunnerProps) {
  const [output, setOutput] = useState('Ready.')
  const [running, setRunning] = useState(false)

  const appendOutput = useCallback((text: string) => {
    setOutput((prev) => prev + text)
  }, [])

  const log = useCallback(
    (text: string) => {
      appendOutput(text.endsWith('\n') ? text : `${text}\n`)
    },
    [appendOutput],
  )

  const handleRun = useCallback(async () => {
    if (running) return
    setRunning(true)
    setOutput('')
    try {
      await run({ setOutput, appendOutput, log })
    } finally {
      setRunning(false)
    }
  }, [appendOutput, log, run, running])

  return (
    <ExampleLayout
      tag={tag}
      title={title}
      description={description}
      actions={
        <button className="primary-btn" onClick={handleRun} disabled={running}>
          {running ? 'Running…' : 'Run'}
        </button>
      }
    >
      <pre className="output">{output}</pre>
    </ExampleLayout>
  )
}
