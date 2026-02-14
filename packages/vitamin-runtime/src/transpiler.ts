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
  prefix?: string
}

export class Transpiler {
  private options: TranspilerOptions

  constructor(options: TranspilerOptions = {}) {
    this.options = options
  }

  compile(source: string, loader: LoaderType, fileName = 'input.ts'): TranspileResult {
    if (loader === 'json') {
      return { code: `export default ${source}` }
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

    // if configured, rewrite module specifiers before transpiling
    if (this.options.prefix) {
      source = this.rewriteModuleSpecifiersAst(
        source,
        normalizedFileName,
        loader,
        this.options.prefix,
      )
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

  getScriptKind(loader: LoaderType): ts.ScriptKind {
    switch (loader) {
      case 'tsx':
        return ts.ScriptKind.TSX
      case 'jsx':
        return ts.ScriptKind.JSX
      case 'js':
      case 'mjs':
      case 'cjs':
        return ts.ScriptKind.JS
      case 'json':
        return ts.ScriptKind.JSON
      case 'ts':
      default:
        return ts.ScriptKind.TS
    }
  }

  private rewriteModuleSpecifiersAst(source: string, fileName: string, loader: LoaderType, prefix: string): string {
    const normalizeSpecifier = (specifier: string): string => {
      if (specifier.startsWith(prefix)) return specifier
      if (specifier.startsWith('.') || specifier.startsWith('/')) return specifier
      return prefix.endsWith('/') ? `${prefix}${specifier}` : `${prefix}/${specifier}`
    }

    const sourceFile = ts.createSourceFile(
      fileName,
      source,
      this.options.target ?? ts.ScriptTarget.ES2020,
      true,
      this.getScriptKind(loader),
    )

    const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
      const visit: ts.Visitor = (node) => {
        if (ts.isImportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const next = normalizeSpecifier(node.moduleSpecifier.text)
          if (next !== node.moduleSpecifier.text) {
            return context.factory.updateImportDeclaration(
              node,
              node.modifiers,
              node.importClause,
              context.factory.createStringLiteral(next),
              node.assertClause,
            )
          }
        }

        if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
          const next = normalizeSpecifier(node.moduleSpecifier.text)
          if (next !== node.moduleSpecifier.text) {
            return context.factory.updateExportDeclaration(
              node,
              node.modifiers,
              node.isTypeOnly,
              node.exportClause,
              context.factory.createStringLiteral(next),
              node.assertClause,
            )
          }
        }

        if (ts.isCallExpression(node) && node.arguments.length === 1 && ts.isStringLiteral(node.arguments[0])) {
          const arg = node.arguments[0]

          if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
            const next = normalizeSpecifier(arg.text)
            if (next !== arg.text) {
              return context.factory.updateCallExpression(
                node,
                node.expression,
                node.typeArguments,
                [context.factory.createStringLiteral(next)],
              )
            }
          }

          if (ts.isIdentifier(node.expression) && node.expression.text === 'require') {
            const next = normalizeSpecifier(arg.text)
            if (next !== arg.text) {
              return context.factory.updateCallExpression(
                node,
                node.expression,
                node.typeArguments,
                [context.factory.createStringLiteral(next)],
              )
            }
          }
        }

        return ts.visitEachChild(node, visit, context)
      }

      return (node) => ts.visitNode(node, visit) as ts.SourceFile
    }

    const transformed = ts.transform(sourceFile, [transformer])
    const output = ts.createPrinter().printFile(transformed.transformed[0])
    transformed.dispose()
    return output
  }
}
