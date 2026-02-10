export function createStringDecoderModule() {
  class StringDecoder {
    decoder: TextDecoder

    constructor(encoding = 'utf-8') {
      this.decoder = new TextDecoder(encoding)
    }

    write(buffer: Uint8Array): string {
      return this.decoder.decode(buffer, { stream: true })
    }

    end(buffer?: Uint8Array): string {
      if (buffer) return this.decoder.decode(buffer)
      return this.decoder.decode()
    }
  }

  return { StringDecoder }
}
