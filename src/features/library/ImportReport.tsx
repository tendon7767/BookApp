import { useState } from 'react'
import { X } from 'lucide-react'
import type { ImportNotice } from './useLibrary'

export function ImportReport({
  notices,
  onDismiss,
}: {
  notices: ImportNotice[]
  onDismiss: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const added = notices.filter((n) => n.added).length
  const failed = notices.filter((n) => n.failed).length
  const skipped = notices.length - added - failed
  const summary = [
    `已加入 ${added} 本`,
    skipped ? `${skipped} 本重複` : '',
    failed ? `${failed} 本失敗` : '',
  ]
    .filter(Boolean)
    .join('，')
  return (
    <section className="import-report" aria-label="匯入結果">
      <div className="import-report-header">
        <span role="status">{summary}</span>
        <button
          className="import-detail-toggle"
          aria-expanded={expanded}
          aria-controls="import-result-details"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? '收起詳情' : '查看詳情'}
        </button>
        <button className="icon-button" aria-label="關閉匯入結果" onClick={onDismiss}>
          <X size={18} />
        </button>
      </div>
      {expanded && (
        <ul id="import-result-details">
          {notices.map((notice, index) => (
            <li key={index} className={notice.failed ? 'import-failed' : ''}>
              <span>{notice.name}</span>
              <p>{notice.message}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
