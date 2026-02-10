import { Transpiler, type LoaderType } from '../transpiler'

export function createBunTranspilerModule(): Record<string, unknown> {
  const transpiler = new Transpiler()
  return {
    transpile(source: string, options?: { loader?: LoaderType; filename?: string }) {
      const loader = options?.loader ?? 'ts'
      const filename = options?.filename ?? '/transpile.ts'
      const result = transpiler.compile(source, loader, filename)
      return result.code
    },
  }
}
