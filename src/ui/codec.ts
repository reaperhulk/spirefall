// URL-safe gzip codec for replay links: compresses the v2 replay JSON into
// a ?replay= parameter any modern browser can decode. Base64url (RFC 4648
// §5) so the blob never needs percent-encoding.

async function throughStream(bytes: Uint8Array, stream: { writable: WritableStream; readable: ReadableStream }): Promise<Uint8Array> {
  const writer = stream.writable.getWriter()
  void writer.write(bytes)
  void writer.close()
  const out: number[] = []
  const reader = stream.readable.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    out.push(...(value as Uint8Array))
  }
  return new Uint8Array(out)
}

export async function gzipBase64Url(text: string): Promise<string | null> {
  try {
    if (typeof CompressionStream === 'undefined') return null
    const packed = await throughStream(new TextEncoder().encode(text), new CompressionStream('gzip'))
    let bin = ''
    for (const b of packed) bin += String.fromCharCode(b)
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  } catch {
    return null
  }
}

export async function gunzipBase64Url(blob: string): Promise<string | null> {
  try {
    if (typeof DecompressionStream === 'undefined') return null
    const b64 = blob.replace(/-/g, '+').replace(/_/g, '/')
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    return new TextDecoder().decode(await throughStream(bytes, new DecompressionStream('gzip')))
  } catch {
    return null
  }
}
