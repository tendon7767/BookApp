export interface SeriesAssignment {
  id: string
  volume: number | null
}

export function normalizeSeries(series: string | null, volume: number | null) {
  const name = series?.trim() || null
  if ((name?.length ?? 0) > 100) throw new Error('系列名稱最多 100 字。')
  if (!name) return { series: null, volume: null }
  if (volume !== null && (!Number.isFinite(volume) || volume <= 0 || volume > 9999))
    throw new Error('集數需介於 0 與 9999 之間，且大於 0；番外可留白。')
  return { series: name, volume }
}
