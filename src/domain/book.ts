export type BookFormat = 'epub' | 'txt' | 'pdf'
export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be' | 'big5' | 'gb18030'
export type TextEncodingChoice = 'auto' | TextEncoding

export interface BookMetadata {
  id: string
  title: string
  originalTitle: string
  author: string
  format: BookFormat
  category: string | null
  // Optional additive fields: existing v4 records remain valid without rewriting book files.
  series?: string | null
  volume?: number | null
  createdAt: number
  modifiedAt: number
  fileName: string
  fileHash: string
  fileSize: number
  hasCover: boolean
  downloaded?: boolean
  coverCached?: boolean
  cloudSource?: { accountId: string; folderId: string; id: string; coverId?: string }
}

// Reflowable books store content locations, never page numbers.
export type ReadingLocation =
  | { format: 'epub'; cfi: string }
  | {
      format: 'txt'
      // UTF-16 code-unit offset after BOM removal and CRLF/CR → LF normalization (v1).
      characterOffset: number
      textVersion?: 1
      encoding?: TextEncoding
      encodingChoice?: TextEncodingChoice
    }
  | { format: 'pdf'; page: number }

export interface ReadingProgress {
  bookId: string
  location: ReadingLocation
  percentage: number
  updatedAt: number
}

export interface LibraryBook extends BookMetadata {
  progress?: ReadingProgress
}

export interface BookEdits {
  title: string
  author: string
  category: string | null
  // Optional additive fields: existing v4 records remain valid without rewriting book files.
  series?: string | null
  volume?: number | null
}
