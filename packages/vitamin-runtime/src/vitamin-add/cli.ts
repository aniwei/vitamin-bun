import type { AddRequest, BunAddOptions } from './types'

export function parseAddArgs(args: string[], options: BunAddOptions): AddRequest[] {
  const dependencyType = options.peer
    ? 'peerDependencies'
    : options.optional
      ? 'optionalDependencies'
      : options.dev
        ? 'devDependencies'
        : 'dependencies'

  return args.map((input) => {
    const { name, spec } = splitPackageSpec(input)
    return {
      name,
      spec: spec ?? 'latest',
      dependencyType,
    }
  })
}

function splitPackageSpec(input: string): { name: string; spec?: string } {
  if (input.startsWith('@')) {
    const secondAt = input.indexOf('@', 1)
    if (secondAt === -1) {
      return { name: input }
    }
    return { name: input.slice(0, secondAt), spec: input.slice(secondAt + 1) }
  }
  const at = input.indexOf('@')
  if (at === -1) return { name: input }
  return { name: input.slice(0, at), spec: input.slice(at + 1) }
}
