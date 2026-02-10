export type VitaminAddOptions = {
  cwd?: string
  dev?: boolean
  peer?: boolean
  optional?: boolean
  workspace?: boolean
}

export type AddRequest = {
  name: string
  spec: string
  dependencyType: 'dependencies' | 'devDependencies' | 'peerDependencies' | 'optionalDependencies'
}
