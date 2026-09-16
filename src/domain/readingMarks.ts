import type { ReadingLocation } from './book'

export interface Bookmark {
  id: string
  location: ReadingLocation
  percentage: number
  label: string
  excerpt?: string
  createdAt: number
  updatedAt: number
}

export interface ReadingTrailEntry {
  id: string
  location: ReadingLocation
  percentage: number
  label: string
  createdAt: number
}

export interface ReadingMarks {
  bookmarks: Bookmark[]
  trail: ReadingTrailEntry[]
  updatedAt: number
}

export const emptyReadingMarks = (): ReadingMarks => ({ bookmarks: [], trail: [], updatedAt: 0 })
