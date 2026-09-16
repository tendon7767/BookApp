import { LibraryBig, CheckCheck, Tags, Trash2, X } from 'lucide-react'

export function LibrarySelectionBar({
  count,
  all,
  disabled,
  onAll,
  onCategory,
  onSeries,
  onRemove,
  onCancel,
}: {
  count: number
  all: boolean
  disabled: boolean
  onAll: () => void
  onCategory: () => void
  onSeries: () => void
  onRemove: () => void
  onCancel: () => void
}) {
  return (
    <>
      <span className="selection-count" role="status">
        已選
        <br />
        <strong>{count}</strong> 本
      </span>
      <button
        className="library-action"
        aria-label={all ? '取消全選目前結果' : '全選目前結果'}
        onClick={onAll}
        disabled={disabled}
      >
        <CheckCheck size={21} />
        <span>{all ? '取消全選' : '全選'}</span>
      </button>
      <button
        className="library-action"
        aria-label="批次分類"
        onClick={onCategory}
        disabled={!count}
      >
        <Tags size={21} />
        <span>分類</span>
      </button>
      <button className="library-action" aria-label="設定系列" onClick={onSeries} disabled={!count}>
        <LibraryBig size={21} />
        <span>系列</span>
      </button>
      <button className="library-action" aria-label="批次移除" onClick={onRemove} disabled={!count}>
        <Trash2 size={21} />
        <span>移除</span>
      </button>
      <button className="library-action" aria-label="結束選取" onClick={onCancel}>
        <X size={21} />
        <span>取消</span>
      </button>
    </>
  )
}
