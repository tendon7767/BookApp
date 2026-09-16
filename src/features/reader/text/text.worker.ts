import { decodeText } from './textDocument'
import type { TextEncodingChoice } from '../../../domain/book'

self.onmessage = (event: MessageEvent<{ bytes: ArrayBuffer; choice: TextEncodingChoice }>) => {
  try {
    self.postMessage({ document: decodeText(new Uint8Array(event.data.bytes), event.data.choice) })
  } catch {
    self.postMessage({ error: '無法解讀這個 TXT，請檢查原始檔案。' })
  }
}
