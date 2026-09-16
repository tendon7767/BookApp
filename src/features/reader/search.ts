import type { ReadingLocation } from '../../domain/book'

export interface ReaderSearchResult {
  id: string
  location: ReadingLocation
  excerpt: string
  chapter?: string
}
