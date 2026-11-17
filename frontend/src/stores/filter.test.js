import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { SEARCH_DEBOUNCE_MS, useFilterStore } from './filter'

describe('useFilterStore', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('debounces the search text by 300 ms', () => {
    const filter = useFilterStore()
    filter.setSearch('kat')
    filter.setSearch('katze')

    expect(filter.search).toBe('katze')
    expect(filter.query).toBe('')

    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS - 1)
    expect(filter.query).toBe('')
    vi.advanceTimersByTime(1)
    expect(filter.query).toBe('katze')
  })

  it('toggles the type tab and clears it on a second click', () => {
    const filter = useFilterStore()
    filter.toggleType('gif')
    expect(filter.type).toBe('gif')
    filter.toggleType('meme')
    expect(filter.type).toBe('meme')
    filter.toggleType('meme')
    expect(filter.type).toBe('')
  })

  it('toggles tags case-insensitively', () => {
    const filter = useFilterStore()
    filter.toggleTag('Katze')
    filter.toggleTag('montag')
    expect(filter.tags).toEqual(['katze', 'montag'])
    filter.toggleTag('KATZE')
    expect(filter.tags).toEqual(['montag'])
  })

  it('builds API params and a URL query without empty values', () => {
    const filter = useFilterStore()
    expect(filter.urlQuery).toEqual({})
    expect(filter.isFiltered).toBe(false)

    filter.toggleType('video')
    filter.toggleTag('katze')
    filter.hydrate({ type: 'video', q: ' lol ', tag: ['katze'] })

    expect(filter.apiParams).toEqual({ type: 'video', q: 'lol', tag: ['katze'] })
    expect(filter.urlQuery).toEqual({ type: 'video', q: 'lol', tag: ['katze'] })
    expect(filter.isFiltered).toBe(true)
  })

  it('hydrates from a route query, including a single tag and bad types', () => {
    const filter = useFilterStore()
    filter.hydrate({ type: 'gif', q: 'kaffee', tag: 'Montag' })
    expect(filter.type).toBe('gif')
    expect(filter.query).toBe('kaffee')
    expect(filter.search).toBe('kaffee')
    expect(filter.tags).toEqual(['montag'])

    filter.hydrate({ type: 'sticker' })
    expect(filter.type).toBe('')
    expect(filter.tags).toEqual([])
    expect(filter.query).toBe('')
  })

  it('hydrate cancels a pending debounced search', () => {
    const filter = useFilterStore()
    filter.setSearch('alt')
    filter.hydrate({ q: 'neu' })
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS * 2)
    expect(filter.query).toBe('neu')
  })

  it('keeps the default sort out of the URL and API params', () => {
    const filter = useFilterStore()
    expect(filter.sort).toBe('newest')
    expect(filter.apiParams.ordering).toBeUndefined()
    expect(filter.urlQuery.sort).toBeUndefined()

    filter.setSort('largest')
    expect(filter.apiParams.ordering).toBe('largest')
    expect(filter.urlQuery).toEqual({ sort: 'largest' })
    expect(filter.isFiltered).toBe(false)
  })

  it('ignores unknown sorts and reads the sort from the route', () => {
    const filter = useFilterStore()
    filter.hydrate({ sort: 'oldest' })
    expect(filter.sort).toBe('oldest')
    filter.hydrate({ sort: 'toString' })
    expect(filter.sort).toBe('newest')
  })

  it('count params leave out the type and the sort', () => {
    const filter = useFilterStore()
    filter.hydrate({ type: 'gif', q: 'x', tag: 'y', sort: 'oldest' })
    expect(filter.countParams).toEqual({ q: 'x', tag: ['y'] })
  })

  it('reset clears the filters but keeps the sort', () => {
    const filter = useFilterStore()
    filter.hydrate({ type: 'gif', q: 'x', sort: 'oldest' })
    filter.reset()
    expect(filter.urlQuery).toEqual({ sort: 'oldest' })
  })

  it('clearSearch drops the query at once', () => {
    const filter = useFilterStore()
    filter.setSearch('katze')
    vi.advanceTimersByTime(SEARCH_DEBOUNCE_MS)
    filter.clearSearch()
    expect(filter.query).toBe('')
    expect(filter.search).toBe('')
  })

  it('reset clears everything', () => {
    const filter = useFilterStore()
    filter.hydrate({ type: 'gif', q: 'x', tag: 'y' })
    filter.reset()
    expect(filter.urlQuery).toEqual({})
    expect(filter.search).toBe('')
  })
})
