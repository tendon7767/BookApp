import type { BookMetadata } from '../../../domain/book'
import { ReaderView } from '../ReaderView'
import { encodingChoice, encodingLabels } from './textDocument'
import { useTextReader } from './useTextReader'

export default function TextReader({ book, onClose }: { book: BookMetadata; onClose: () => void }) {
  const { host, ...reader } = useTextReader(book)
  return (
    <ReaderView
      book={book}
      onClose={onClose}
      reader={reader}
      extraControls={
        <label className="text-encoding">
          <span>TXT 編碼</span>
          <select
            aria-label="TXT 編碼"
            value={reader.choice}
            disabled={reader.busy}
            onChange={(event) => void reader.changeEncoding(encodingChoice(event.target.value))}
          >
            {Object.entries(encodingLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {value === 'auto' ? `自動 · ${encodingLabels[reader.encoding]}` : label}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div ref={host} className="text-host" aria-label="TXT 內文" />
    </ReaderView>
  )
}
