import { Search, X, Tags, ArrowDownWideNarrow } from 'lucide-react'
import type { LibraryFilter, LibrarySort } from './libraryView'

export function LibraryFilters({
  filter,
  categories,
  onChange,
}: {
  filter: LibraryFilter
  categories: string[]
  onChange: (filter: LibraryFilter) => void
}) {
  return (
    <div className="library-filters library-tools" role="search" aria-label="搜尋書庫">
      <div className="library-search">
        <Search size={18} aria-hidden="true" />
        <input
          type="search"
          aria-label="搜尋書籍"
          placeholder="搜尋書名、作者、分類、系列"
          value={filter.query}
          onChange={(event) => onChange({ ...filter, query: event.target.value })}
        />
        {filter.query && (
          <button
            className="icon-button"
            aria-label="清除搜尋"
            onClick={() => onChange({ ...filter, query: '' })}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <div className="library-filter-row">
        <label className="library-select">
          <Tags size={18} aria-hidden="true" />
          <select
            aria-label="分類篩選"
            value={filter.category}
            onChange={(event) => onChange({ ...filter, category: event.target.value })}
          >
            <option value="all">全部分類</option>
            <option value="uncategorized">未分類</option>
            {filter.category.startsWith('category:') &&
              !categories.includes(filter.category.slice(9)) && (
                <option value={filter.category}>{filter.category.slice(9)}（無書籍）</option>
              )}
            {categories.map((category) => (
              <option key={category} value={`category:${category}`}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="library-select">
          <ArrowDownWideNarrow size={18} aria-hidden="true" />
          <select
            aria-label="書庫排序"
            value={filter.sort}
            onChange={(event) => onChange({ ...filter, sort: event.target.value as LibrarySort })}
          >
            <option value="recent">最近閱讀</option>
            <option value="added">最近加入</option>
            <option value="title">書名排序</option>
          </select>
        </label>
      </div>
    </div>
  )
}
