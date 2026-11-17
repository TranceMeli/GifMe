import { defineStore } from 'pinia'
import * as api from '@/api/items'
import { useFilterStore } from './filter'

// Guards against out-of-order responses when filters change quickly.
let listRequestId = 0

export const useItemsStore = defineStore('items', {
  state: () => ({
    items: [],
    count: 0,
    counts: { gif: 0, meme: 0, video: 0, total: 0 },
    page: 1,
    hasMore: false,
    current: null,
    loading: false,
    loadingMore: false,
    error: '',
  }),

  actions: {
    /** Load the first page for the current filters. */
    async fetch() {
      const id = ++listRequestId
      this.loading = true
      this.error = ''
      const filter = useFilterStore()
      try {
        const [data, counts] = await Promise.all([
          api.listItems(filter.apiParams),
          // The tab numbers are a nicety; a failure here must not break the list.
          api.getCounts(filter.countParams).catch(() => null),
        ])
        if (id !== listRequestId) return
        if (counts) this.counts = counts
        this.items = data.results
        this.count = data.count
        this.page = 1
        this.hasMore = Boolean(data.next)
      } catch (err) {
        if (id !== listRequestId) return
        this.error = err.message
        this.items = []
        this.count = 0
        this.hasMore = false
      } finally {
        if (id === listRequestId) this.loading = false
      }
    },

    async fetchMore() {
      if (!this.hasMore || this.loadingMore) return
      const id = listRequestId
      this.loadingMore = true
      try {
        const data = await api.listItems({ ...useFilterStore().apiParams, page: this.page + 1 })
        if (id !== listRequestId) return
        this.items.push(...data.results)
        this.page += 1
        this.hasMore = Boolean(data.next)
      } catch (err) {
        this.error = err.message
      } finally {
        this.loadingMore = false
      }
    },

    async get(id) {
      this.loading = true
      this.error = ''
      this.current = null
      try {
        this.current = await api.getItem(id)
      } catch (err) {
        this.error = err.message
      } finally {
        this.loading = false
      }
      return this.current
    },

    /** Returns the new item. Errors (duplicates, validation) propagate to the caller. */
    async create(payload) {
      return api.createItem(payload)
    },

    async update(id, patch) {
      const item = await api.updateItem(id, patch)
      this._replace(item)
      return item
    },

    async remove(id) {
      const gone = this.items.find((i) => i.id === id) || (this.current?.id === id ? this.current : null)
      await api.deleteItem(id)
      if (gone && this.counts[gone.type] > 0) {
        this.counts[gone.type] -= 1
        this.counts.total = Math.max(0, this.counts.total - 1)
      }
      this.items = this.items.filter((i) => i.id !== id)
      this.count = Math.max(0, this.count - 1)
      if (this.current?.id === id) this.current = null
    },

    /** Optimistic: flips the star at once and rolls back if the request fails. */
    async toggleFavorite(id) {
      const item = this.current?.id === id ? this.current : this.items.find((i) => i.id === id)
      if (!item) return
      const previous = item.is_favorite
      this._replace({ ...item, is_favorite: !previous })
      try {
        this._replace(await api.updateItem(id, { is_favorite: !previous }))
      } catch (err) {
        this._replace({ ...item, is_favorite: previous })
        throw err
      }
    },

    _replace(item) {
      const index = this.items.findIndex((i) => i.id === item.id)
      if (index !== -1) this.items[index] = item
      if (this.current?.id === item.id) this.current = item
    },
  },
})
