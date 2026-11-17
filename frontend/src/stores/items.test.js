import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { ApiError } from '@/api/client'
import * as api from '@/api/items'
import { deferred, makeItem, page } from '@/test/helpers'
import { useFilterStore } from './filter'
import { useItemsStore } from './items'

vi.mock('@/api/items')

const counts = { gif: 2, meme: 1, video: 0, total: 3 }

describe('useItemsStore', () => {
  let store

  beforeEach(() => {
    vi.resetAllMocks()
    setActivePinia(createPinia())
    store = useItemsStore()
    api.getCounts.mockResolvedValue(counts)
  })

  describe('fetch', () => {
    it('loads the first page and the type counts for the current filters', async () => {
      const filter = useFilterStore()
      filter.hydrate({ type: 'gif', q: 'cat', tag: 'pet', sort: 'oldest' })
      api.listItems.mockResolvedValue(page([makeItem({ id: 1 }), makeItem({ id: 2 })], { count: 5, next: '/api/items/?page=2' }))

      await store.fetch()

      expect(api.listItems).toHaveBeenCalledWith({ type: 'gif', q: 'cat', tag: ['pet'], ordering: 'oldest' })
      expect(api.getCounts).toHaveBeenCalledWith({ q: 'cat', tag: ['pet'] })
      expect(store.items.map((i) => i.id)).toEqual([1, 2])
      expect(store.count).toBe(5)
      expect(store.hasMore).toBe(true)
      expect(store.counts).toEqual(counts)
      expect(store.loading).toBe(false)
      expect(store.error).toBe('')
    })

    it('still shows the list when only the counts request fails', async () => {
      api.listItems.mockResolvedValue(page([makeItem()]))
      api.getCounts.mockRejectedValue(new Error('boom'))
      await store.fetch()
      expect(store.items).toHaveLength(1)
      expect(store.error).toBe('')
      expect(store.counts).toEqual({ gif: 0, meme: 0, video: 0, total: 0 })
    })

    it('records the error message and empties the list when the request fails', async () => {
      api.listItems.mockResolvedValue(page([makeItem()]))
      await store.fetch()
      api.listItems.mockRejectedValue(new ApiError('The server cannot be reached. Is the backend running?'))
      await store.fetch()
      expect(store.error).toBe('The server cannot be reached. Is the backend running?')
      expect(store.items).toEqual([])
      expect(store.count).toBe(0)
      expect(store.hasMore).toBe(false)
      expect(store.loading).toBe(false)
    })

    it('ignores a slow response that arrives after a newer one', async () => {
      const slow = deferred()
      const fast = deferred()
      api.listItems.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise)

      const first = store.fetch()
      const second = store.fetch()
      fast.resolve(page([makeItem({ id: 2 })]))
      await second
      slow.resolve(page([makeItem({ id: 1 })]))
      await first

      expect(store.items.map((i) => i.id)).toEqual([2])
      expect(store.loading).toBe(false)
    })
  })

  describe('fetchMore', () => {
    it('appends the next page and tracks whether more exists', async () => {
      api.listItems.mockResolvedValueOnce(page([makeItem({ id: 1 })], { count: 2, next: 'next' }))
      await store.fetch()
      api.listItems.mockResolvedValueOnce(page([makeItem({ id: 2 })], { count: 2, next: null }))

      await store.fetchMore()

      expect(api.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
      expect(store.items.map((i) => i.id)).toEqual([1, 2])
      expect(store.page).toBe(2)
      expect(store.hasMore).toBe(false)
      expect(store.loadingMore).toBe(false)
    })

    it('does nothing when there is no further page', async () => {
      api.listItems.mockResolvedValue(page([makeItem()]))
      await store.fetch()
      api.listItems.mockClear()
      await store.fetchMore()
      expect(api.listItems).not.toHaveBeenCalled()
    })

    it('does not start a second request while one is running', async () => {
      api.listItems.mockResolvedValueOnce(page([makeItem()], { next: 'next' }))
      await store.fetch()
      const pending = deferred()
      api.listItems.mockReturnValueOnce(pending.promise)
      const first = store.fetchMore()
      await store.fetchMore()
      expect(api.listItems).toHaveBeenCalledTimes(2)
      pending.resolve(page([]))
      await first
    })

    it('drops a page that belongs to an outdated filter', async () => {
      api.listItems.mockResolvedValueOnce(page([makeItem({ id: 1 })], { next: 'next' }))
      await store.fetch()
      const late = deferred()
      api.listItems.mockReturnValueOnce(late.promise)
      const more = store.fetchMore()
      api.listItems.mockResolvedValueOnce(page([makeItem({ id: 9 })]))
      await store.fetch()
      late.resolve(page([makeItem({ id: 2 })]))
      await more
      expect(store.items.map((i) => i.id)).toEqual([9])
    })
  })

  describe('single items', () => {
    it('get loads the item and returns it', async () => {
      api.getItem.mockResolvedValue(makeItem({ id: 7 }))
      const item = await store.get(7)
      expect(item.id).toBe(7)
      expect(store.current.id).toBe(7)
      expect(store.loading).toBe(false)
    })

    it('get clears the previous item and keeps the error message', async () => {
      api.getItem.mockResolvedValueOnce(makeItem({ id: 7 }))
      await store.get(7)
      api.getItem.mockRejectedValueOnce(new ApiError('The item was not found.'))
      const item = await store.get(8)
      expect(item).toBeNull()
      expect(store.current).toBeNull()
      expect(store.error).toBe('The item was not found.')
    })

    it('create passes the payload through and lets errors reach the caller', async () => {
      api.createItem.mockResolvedValueOnce(makeItem({ id: 3 }))
      await expect(store.create({ url: 'https://e.example/a.gif' })).resolves.toMatchObject({ id: 3 })
      api.createItem.mockRejectedValueOnce(new ApiError('dup', { status: 409, code: 'duplicate' }))
      await expect(store.create({})).rejects.toMatchObject({ code: 'duplicate' })
    })

    it('update replaces the item in the list and in current', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1, title: 'old' })]))
      await store.fetch()
      api.getItem.mockResolvedValue(makeItem({ id: 1, title: 'old' }))
      await store.get(1)
      api.updateItem.mockResolvedValue(makeItem({ id: 1, title: 'new' }))

      await store.update(1, { title: 'new' })

      expect(api.updateItem).toHaveBeenCalledWith(1, { title: 'new' })
      expect(store.items[0].title).toBe('new')
      expect(store.current.title).toBe('new')
    })
  })

  describe('remove', () => {
    it('drops the item and lowers the counts of its type', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1 }), makeItem({ id: 2, type: 'meme' })], { count: 3 }))
      await store.fetch()
      api.deleteItem.mockResolvedValue(null)

      await store.remove(1)

      expect(store.items.map((i) => i.id)).toEqual([2])
      expect(store.count).toBe(2)
      expect(store.counts).toEqual({ gif: 1, meme: 1, video: 0, total: 2 })
    })

    it('clears current when the open item is deleted', async () => {
      api.getItem.mockResolvedValue(makeItem({ id: 4 }))
      await store.get(4)
      api.deleteItem.mockResolvedValue(null)
      await store.remove(4)
      expect(store.current).toBeNull()
    })

    it('never lets a count go below zero', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1 })], { count: 1 }))
      api.getCounts.mockResolvedValue({ gif: 0, meme: 0, video: 0, total: 0 })
      await store.fetch()
      api.deleteItem.mockResolvedValue(null)
      await store.remove(1)
      expect(store.count).toBe(0)
      expect(store.counts.gif).toBe(0)
      expect(store.counts.total).toBe(0)
    })

    it('keeps the item when the server refuses', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1 })]))
      await store.fetch()
      api.deleteItem.mockRejectedValue(new ApiError('nope'))
      await expect(store.remove(1)).rejects.toThrow('nope')
      expect(store.items).toHaveLength(1)
      expect(store.counts).toEqual(counts)
    })
  })

  describe('toggleFavorite', () => {
    it('flips the star at once and keeps the server answer', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1, is_favorite: false })]))
      await store.fetch()
      const reply = deferred()
      api.updateItem.mockReturnValue(reply.promise)

      const pending = store.toggleFavorite(1)
      expect(store.items[0].is_favorite).toBe(true)
      reply.resolve(makeItem({ id: 1, is_favorite: true, title: 'from server' }))
      await pending

      expect(api.updateItem).toHaveBeenCalledWith(1, { is_favorite: true })
      expect(store.items[0].title).toBe('from server')
    })

    it('rolls back when the request fails and rethrows', async () => {
      api.listItems.mockResolvedValue(page([makeItem({ id: 1, is_favorite: true })]))
      await store.fetch()
      api.updateItem.mockRejectedValue(new ApiError('offline'))
      await expect(store.toggleFavorite(1)).rejects.toThrow('offline')
      expect(store.items[0].is_favorite).toBe(true)
    })

    it('works on the open item when it is not in the list', async () => {
      api.getItem.mockResolvedValue(makeItem({ id: 5, is_favorite: false }))
      await store.get(5)
      api.updateItem.mockResolvedValue(makeItem({ id: 5, is_favorite: true }))
      await store.toggleFavorite(5)
      expect(store.current.is_favorite).toBe(true)
    })

    it('ignores unknown ids', async () => {
      await store.toggleFavorite(99)
      expect(api.updateItem).not.toHaveBeenCalled()
    })
  })
})
