import { useState } from 'react'
import { SeriesFields, VolumeField } from './SeriesFields'
import type { BookEdits, BookMetadata } from '../../domain/book'

export function BookMetadataForm({
  book,
  categories,
  seriesNames,
  saving,
  onSave,
  onCancel,
}: {
  book: BookMetadata
  categories: string[]
  seriesNames: string[]
  saving: boolean
  onSave: (edits: BookEdits) => Promise<void>
  onCancel: () => void
}) {
  const [title, setTitle] = useState(book.title)
  const [author, setAuthor] = useState(book.author)
  const [series, setSeries] = useState(book.series ?? '')
  const [volume, setVolume] = useState(book.volume?.toString() ?? '')
  const [category, setCategory] = useState(book.category ?? '')
  return (
    <form
      className="book-edit-form"
      onSubmit={(event) => {
        event.preventDefault()
        if (!saving && title.trim())
          void onSave({ title, author, category, series, volume: volume ? Number(volume) : null })
      }}
    >
      <label>
        書名
        <input
          autoFocus
          required
          maxLength={200}
          value={title}
          disabled={saving}
          onChange={(event) => setTitle(event.target.value)}
        />
      </label>
      <label>
        作者
        <input
          maxLength={120}
          value={author}
          disabled={saving}
          onChange={(event) => setAuthor(event.target.value)}
        />
      </label>
      <label>
        分類
        <input
          maxLength={60}
          list="book-categories"
          placeholder="留白代表未分類"
          value={category}
          disabled={saving}
          onChange={(event) => setCategory(event.target.value)}
        />
      </label>
      <datalist id="book-categories">
        {categories.map((item) => (
          <option key={item} value={item} />
        ))}
      </datalist>
      <SeriesFields
        name={series}
        onName={setSeries}
        names={seriesNames}
        disabled={saving}
        listId="book-series-names"
      />
      <VolumeField value={volume} onChange={setVolume} disabled={saving || !series.trim()} />
      <div className="confirmation-actions">
        <button type="button" className="secondary-button" disabled={saving} onClick={onCancel}>
          取消編輯
        </button>
        <button type="submit" className="primary-button" disabled={saving || !title.trim()}>
          {saving ? '儲存中…' : '儲存變更'}
        </button>
      </div>
    </form>
  )
}
