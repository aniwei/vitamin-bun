import { WorkerRunner } from '@vitamin-ai/shared'

export class WorkerExampleRunner extends WorkerRunner {
  
}

const workerExample = new WorkerExampleRunner()

workerExample.on('message', (data) => {
  console.log('Received message from worker:', data)
})

workerExample.on('init', (payload) => {
  console.log('Worker is initialized', payload)

})