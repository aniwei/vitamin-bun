import React from 'react'
import { createVitaminContainer } from '@vitamin-ai/sdk'
import { WorkerMain } from '@vitamin-ai/shared'
import { ExampleRunner } from '../components/ExampleRunner'


class WorkerExample extends WorkerMain {
  constructor() {
    super('share-worker', new URL('./WorkerRunnerExample.ts', import.meta.url))
  }

  forwardTo(...args: unknown[]): Promise<Response> {
    // Implement the logic to forward messages to the worker and return a response
    return Promise.resolve(new Response('Message forwarded to worker'))
  }
}

export function Example21Share() {
  return (
    <ExampleRunner
      tag="Example 21"
      title="Share"
      description="Add a dependency and inspect the updated manifest."
      run={async ({ log, setOutput }) => {
        setOutput('Booting container...\n')

        const example = new WorkerExample()
        await example.start()
            
      }}
    />
  )
}
