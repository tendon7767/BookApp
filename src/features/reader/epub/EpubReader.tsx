import type { BookMetadata } from '../../../domain/book'
import { ReaderView } from '../ReaderView'
import { useEpubReader } from './useEpubReader'

export default function EpubReader({ book, onClose }: { book: BookMetadata; onClose: () => void }) {
  const { host, ...reader } = useEpubReader(book)
  return (
    <ReaderView book={book} onClose={onClose} reader={reader}>
      <div ref={host} className="epub-host" />
    </ReaderView>
  )
}
