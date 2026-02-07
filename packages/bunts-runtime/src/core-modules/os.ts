export function createOsModule() {
  return {
    platform: () => 'browser',
    arch: () => 'wasm',
    cpus: () => [],
    homedir: () => '/',
    tmpdir: () => '/tmp',
    EOL: '\n',
  }
}
