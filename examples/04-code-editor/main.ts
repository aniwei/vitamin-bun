/**
 * Example 04 — Online Code Editor
 *
 * A minimal browser-based code editor that uses Vitamin Bun to execute
 * TypeScript in the browser. Demonstrates a realistic integration pattern
 * with a web UI.
 */
import { createBunContainer, type BunContainer } from '@vitamin-ai/sdk'

// ── UI Elements ─────────────────────────────────────────────────

const editorEl = document.getElementById('editor') as HTMLTextAreaElement
const runBtn = document.getElementById('run-btn') as HTMLButtonElement
const outputEl = document.getElementById('output') as HTMLPreElement
const statusEl = document.getElementById('status') as HTMLSpanElement

// ── Default code ────────────────────────────────────────────────

const DEFAULT_CODE = `\
// Try editing this code and clicking "Run" ▶

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

// ── State ───────────────────────────────────────────────────────

let container: BunContainer | null = null

// ── Init ────────────────────────────────────────────────────────

async function init() {
  editorEl.value = DEFAULT_CODE
  statusEl.textContent = '⏳ Loading runtime…'
  runBtn.disabled = true

  try {
    container = await createBunContainer({
      env: {
        NO_COLOR: '1', // Disable ANSI colors for clean output
      },
    })
    statusEl.textContent = '✅ Ready'
    runBtn.disabled = false
  } catch (err) {
    statusEl.textContent = '❌ Failed to load runtime'
    outputEl.textContent = String(err)
  }
}

// ── Run ─────────────────────────────────────────────────────────

async function run() {
  if (!container) return

  runBtn.disabled = true
  statusEl.textContent = '⚡ Running…'
  outputEl.textContent = ''

  // Write the editor content into the VFS
  await container.fs.writeFile('/playground.ts', editorEl.value)

  // Execute
  const result = await container.exec('bun', ['run', '/playground.ts'])

  // Display output
  let output = ''
  if (result.stdout) output += result.stdout
  if (result.stderr) output += '\n⚠️ stderr:\n' + result.stderr
  output += `\n\n[exit code: ${result.exitCode}]`
  outputEl.textContent = output

  statusEl.textContent = result.exitCode === 0 ? '✅ Success' : '⚠️ Error'
  runBtn.disabled = false
}

// ── Event Listeners ─────────────────────────────────────────────

runBtn.addEventListener('click', run)

// Ctrl+Enter / Cmd+Enter to run
editorEl.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault()
    run()
  }
})

// Boot on page load
init()
