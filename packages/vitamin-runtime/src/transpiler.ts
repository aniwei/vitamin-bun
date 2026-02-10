import * as ts from 'typescript'

export type LoaderType = 'ts' | 'tsx' | 'js' | 'jsx' | 'mjs' | 'cjs' | 'json'

export interface TranspileResult {
  code: string
  map?: string
}

export interface TranspilerOptions {
  jsx?: ts.JsxEmit
  target?: ts.ScriptTarget
  module?: ts.ModuleKind
}

export class Transpiler {
  private options: TranspilerOptions

  constructor(options: TranspilerOptions = {}) {
    this.options = options
  }

  compile(source: string, loader: LoaderType, fileName = 'input.ts'): TranspileResult {
    if (loader === 'json') {
      return { code: `module.exports = ${source}` }
    }

    const normalizedFileName =
      loader === 'mjs' || loader === 'cjs'
        ? fileName.replace(/\.[mc]js$/i, '.js')
        : fileName

    const compilerOptions: ts.CompilerOptions = {
      target: this.options.target ?? ts.ScriptTarget.ES2020,
      module: this.options.module ?? ts.ModuleKind.CommonJS,
      jsx: this.options.jsx ?? ts.JsxEmit.React,
      sourceMap: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    }

    const result = ts.transpileModule(source, {
      compilerOptions,
      fileName: normalizedFileName,
    })

    return {
      code: result.outputText,
      map: result.sourceMapText ?? undefined,
    }
  }
}
