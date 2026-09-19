import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { useBackLayer } from '../../platform/useBackLayer'
export interface TocEntry {
  label: string
  href: string
  subitems?: TocEntry[]
}

function TocItems({
  items,
  href,
  onSelect,
}: {
  items: TocEntry[]
  href?: string
  onSelect: (href: string) => void
}) {
  return (
    <ol>
      {items.map((item, index) => (
        <li key={`${item.href}-${index}`}>
          <button
            aria-current={item.href === href ? 'location' : undefined}
            onClick={() => onSelect(item.href)}
          >
            {item.label.trim() || '未命名章節'}
          </button>
          {!!item.subitems?.length && (
            <TocItems items={item.subitems} href={href} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ol>
  )
}
export function TocDialog({
  items,
  href,
  onSelect,
  onClose,
}: {
  items: TocEntry[]
  href?: string
  onSelect: (href: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useBackLayer(true, onClose)
  useEffect(() => {
    const dialog = ref.current
    dialog?.showModal()
    return () => dialog?.close()
  }, [])
  return (
    <dialog
      ref={ref}
      className="install-dialog toc-dialog"
      aria-labelledby="toc-title"
      onCancel={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="toc-header">
        <h2 id="toc-title">目錄</h2>
        <button className="icon-button" aria-label="關閉目錄" onClick={onClose}>
          <X size={22} />
        </button>
      </div>
      <nav aria-label="章節目錄">
        <TocItems items={items} href={href} onSelect={onSelect} />
      </nav>
      {!items.length && <p className="quiet-note">這本書沒有提供目錄。</p>}
    </dialog>
  )
}
