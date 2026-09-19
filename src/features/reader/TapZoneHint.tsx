import type { ReadingSettings } from './readingSettings'

// Shows where a tap lands: on the first open, after switching zones, or on request.
export function TapZoneHint({ tapZones }: { tapZones: ReadingSettings['tapZones'] }) {
  return (
    <div className={`tap-zone-hint tap-zone-hint-${tapZones}`} aria-hidden="true">
      <span>
        <b>上一頁</b>
      </span>
      <span>
        <b>選單</b>
      </span>
      <span>
        <b>下一頁</b>
      </span>
    </div>
  )
}
