export function createZlibModule() {
  const unsupported = (name: string) => () => {
    throw new Error(`zlib.${name} is not supported in the browser runtime`)
  }

  return {
    deflateSync: unsupported('deflateSync'),
    inflateSync: unsupported('inflateSync'),
    gzipSync: unsupported('gzipSync'),
    gunzipSync: unsupported('gunzipSync'),
    brotliCompressSync: unsupported('brotliCompressSync'),
    brotliDecompressSync: unsupported('brotliDecompressSync'),
    constants: {},
  }
}
