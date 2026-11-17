import { defineStore } from 'pinia'

export const TYPES = ['gif', 'meme', 'video']
export const SORTS = { newest: 'Newest first', oldest: 'Oldest first', largest: 'Largest first' }
export const SEARCH_DEBOUNCE_MS = 300

let timer = null

/**
 * Filter state of the overview. Mirrors the URL query (?type=&q=&tag=&sort=) so that
 * browser back/forward restores it. `search` is the live input value, `query`
 * the debounced value that actually filters. `sort` is not a filter: reset() keeps it.
 */
export const useFilterStore = defineStore('filter', {
  state: () => ({
    type: '',
    search: '',
    query: '',
    tags: [],
    sort: 'newest',
  }),

  getters: {
    /** Parameters for GET /api/items/. */
    apiParams: (state) => ({
      type: state.type || undefined,
      q: state.query || undefined,
      tag: state.tags.length ? state.tags : undefined,
      ordering: state.sort === 'newest' ? undefined : state.sort,
    }),
    /** Parameters for GET /api/items/counts/: everything except the type. */
    countParams: (state) => ({
      q: state.query || undefined,
      tag: state.tags.length ? state.tags : undefined,
    }),
    /** Route query object; empty values and the default sort are left out. */
    urlQuery: (state) => {
      const query = {}
      if (state.type) query.type = state.type
      if (state.query) query.q = state.query
      if (state.tags.length) query.tag = [...state.tags]
      if (state.sort !== 'newest') query.sort = state.sort
      return query
    },
    isFiltered: (state) => Boolean(state.type || state.query || state.tags.length),
  },

  actions: {
    /** Clicking the active tab again clears it. */
    toggleType(type) {
      this.type = this.type === type ? '' : type
    },

    setType(type) {
      this.type = TYPES.includes(type) ? type : ''
    },

    /** Update the input immediately, apply it to the filter after the debounce delay. */
    setSearch(text) {
      this.search = text
      clearTimeout(timer)
      timer = setTimeout(() => {
        this.query = this.search.trim()
      }, SEARCH_DEBOUNCE_MS)
    },

    toggleTag(name) {
      const tag = name.toLowerCase()
      this.tags = this.tags.includes(tag) ? this.tags.filter((t) => t !== tag) : [...this.tags, tag]
    },

    removeTag(name) {
      this.tags = this.tags.filter((t) => t !== name)
    },

    setSort(sort) {
      this.sort = Object.hasOwn(SORTS, sort) ? sort : 'newest'
    },

    /** Drop the search text at once, without waiting for the debounce. */
    clearSearch() {
      clearTimeout(timer)
      this.search = ''
      this.query = ''
    },

    reset() {
      clearTimeout(timer)
      this.type = ''
      this.search = ''
      this.query = ''
      this.tags = []
    },

    /** Load state from a route query, without debounce. */
    hydrate(query = {}) {
      clearTimeout(timer)
      const one = (v) => (Array.isArray(v) ? v[0] : v) || ''
      this.setType(one(query.type))
      this.query = one(query.q).trim()
      this.search = this.query
      const tags = [].concat(query.tag || []).filter(Boolean)
      this.tags = [...new Set(tags.map((t) => String(t).toLowerCase()))]
      this.setSort(one(query.sort))
    },
  },
})
