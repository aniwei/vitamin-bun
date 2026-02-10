import React from 'react'
import { createBunContainer } from '@vitamin-ai/sdk'
import { ExampleRunner } from '../components/ExampleRunner'

export function Example02VirtualFs() {
  return (
    <ExampleRunner
      tag="Example 02"
      title="Virtual Filesystem"
      description="Write, read, mount, and list files inside the container VFS."
      run={async ({ log }) => {
        log('⏳ Booting container...')
        const container = await createBunContainer({})
        log('✅ Container ready\n')

        await container.fs.writeFile('/hello.txt', 'Hello, virtual world!')
        const content = await container.fs.readFile('/hello.txt', 'utf-8')
        log(`Read /hello.txt: ${String(content)}`)

        await container.fs.mkdir('/project/src/components')
        log('Created /project/src/components')

        await container.mount('/project', {
          'package.json': JSON.stringify({
            name: 'my-app',
            version: '1.0.0',
            dependencies: {},
          }, null, 2),
          'src/index.ts': `
            import { greet } from './utils'
            console.log(greet('World'))
          `,
          'src/utils.ts': `
            export function greet(name: string): string {
              return \`Hello, \${name}!\`
            }
          `,
          'src/components/Button.tsx': `
            export function Button({ label }: { label: string }) {
              return <button>{label}</button>
            }
          `,
        })

        const rootEntries = await container.fs.readdir('/project')
        log(`/project contents: ${rootEntries.join(', ')}`)
        const srcEntries = await container.fs.readdir('/project/src')
        log(`/project/src contents: ${srcEntries.join(', ')}`)

        log(`/hello.txt exists? ${await container.fs.exists('/hello.txt')}`)
        await container.fs.unlink('/hello.txt')
        log(`/hello.txt exists after unlink? ${await container.fs.exists('/hello.txt')}`)

        const result = await container.exec('bun', ['run', '/project/src/index.ts'])
        log('\n--- exec output ---')
        log(`stdout: ${result.stdout}`)
        log(`exit code: ${result.exitCode}`)

        await container.dispose()
        log('\n🏁 Done')
      }}
    />
  )
}
