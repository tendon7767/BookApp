import type { ReadingLocation } from '../../domain/book'

// Implementations will live in separate epub/, text/ and pdf/ modules.
export interface ReaderAdapter<Location extends ReadingLocation> {
  open(file: Blob, host: HTMLElement, location?: Location): Promise<void>
  navigate(location: Location): Promise<void>
  next(): Promise<void>
  previous(): Promise<void>
  destroy(): void
}
