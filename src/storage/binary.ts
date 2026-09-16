export interface StoredBinary {
  bytes: ArrayBuffer
  mimeType: string
}

// Keep binary bytes in IDB: WebKit's Blob/File persistence can fail, especially
// in ephemeral contexts. Readers still receive Blobs, independently of storage.
export async function encodeBinary(value: Blob | StoredBinary): Promise<StoredBinary> {
  return value instanceof Blob ? { bytes: await value.arrayBuffer(), mimeType: value.type } : value
}

export function decodeBinary(value: StoredBinary | Blob | undefined): Blob | undefined {
  // Accept earlier development records too; never discard a user's existing file.
  if (value === undefined || value instanceof Blob) return value
  return new Blob([value.bytes], { type: value.mimeType })
}
