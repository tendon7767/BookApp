import { afterEach, describe, expect, it } from 'vitest'
import { deleteDB } from 'idb'
import { DATABASE_NAME } from './database'
import {
  addBookmark,
  popReadingTrail,
  pushReadingTrail,
  readReadingMarks,
  removeBookmark,
} from './readingMarksRepository'

afterEach(() => deleteDB(DATABASE_NAME))

describe('reading marks', () => {
  it('updates a bookmark at the same content location instead of duplicating it', async () => {
    const location = { format: 'epub', cfi: 'epubcfi(/6/2!/4/1:0)' } as const
    await addBookmark('book', { location, percentage: 0.2, label: '第一個名稱' })
    const updated = await addBookmark('book', { location, percentage: 0.21, label: '更新名稱' })
    expect(updated.bookmarks).toHaveLength(1)
    expect(updated.bookmarks[0]).toMatchObject({ label: '更新名稱', percentage: 0.21 })
    await removeBookmark('book', updated.bookmarks[0].id)
    expect((await readReadingMarks('book')).bookmarks).toEqual([])
  })

  it('keeps a bounded jump trail and pops the newest origin', async () => {
    for (let index = 0; index < 25; index++)
      await pushReadingTrail('book', {
        location: { format: 'txt', characterOffset: index },
        percentage: index / 25,
        label: `位置 ${index}`,
      })
    expect((await readReadingMarks('book')).trail).toHaveLength(20)
    const { popped, marks } = await popReadingTrail('book')
    expect(popped?.location).toEqual({ format: 'txt', characterOffset: 24 })
    expect(marks.trail).toHaveLength(19)
  })
})
