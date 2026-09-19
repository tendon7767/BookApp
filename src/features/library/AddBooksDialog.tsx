import { useEffect, useRef } from 'react'
import { Cloud, FolderOpen, X } from 'lucide-react'
import { useBackLayer } from '../../platform/useBackLayer'

export function AddBooksDialog({
  onLocal,
  onCloud,
  onClose,
}: {
  onLocal: () => void
  onCloud: () => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  useBackLayer(true, onClose)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog
      ref={dialog}
      className="install-dialog"
      aria-labelledby="add-books-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="sheet-body">
        <div className="sheet-handle" />
        <button className="icon-button close-dialog" aria-label="關閉加入書籍" onClick={onClose}>
          <X size={22} />
        </button>
        <h2 id="add-books-title">加入書籍</h2>
        <div className="add-book-options">
          <button className="secondary-button" onClick={onLocal}>
            <FolderOpen size={22} />
            從裝置匯入
          </button>
          <button className="secondary-button" onClick={onCloud}>
            <Cloud size={22} />從 Google Drive 加入
          </button>
        </div>
        <p>EPUB / TXT · 每本最高 50 MB</p>
      </div>
    </dialog>
  )
}
