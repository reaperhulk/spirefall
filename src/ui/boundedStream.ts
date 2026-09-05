// Bound both encoded inputs and decompressed output before JSON parsing.
export const MAX_TRANSFER_BYTES = 8 * 1024 * 1024
export async function throughStream(bytes: Uint8Array, stream: { writable: WritableStream; readable: ReadableStream }): Promise<Uint8Array> {
  if (bytes.length > MAX_TRANSFER_BYTES) throw new Error('Transfer is too large')
  const writer = stream.writable.getWriter()
  const writing = (async () => { await writer.write(bytes); await writer.close() })()
  // Attach rejection handling immediately: a corrupt gzip can reject both ends.
  void writing.catch(() => {})
  const chunks: Uint8Array[] = []
  let size = 0
  const reader = stream.readable.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += (value as Uint8Array).length
      if (size > MAX_TRANSFER_BYTES) throw new Error('Expanded transfer is too large')
      chunks.push(value as Uint8Array)
    }
    await writing
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  const out = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length }
  return out
}
