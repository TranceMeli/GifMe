import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as api from '@/api/items'
import { makeItem, mountView, page } from '@/test/helpers'
import ItemsView from './ItemsView.vue'

vi.mock('@/api/items')

const items = [
  makeItem({ id: 1, type: 'gif', title: 'Dancing owl', tags: ['owl'] }),
  makeItem({ id: 2, type: 'meme', title: '', tags: ['language'], file_url: '/media/items/aa/2.png' }),
]

function mockList(results = items, extra = {}) {
  api.listItems.mockResolvedValue(page(results, extra))
  api.getCounts.mockResolvedValue({ gif: 1, meme: 1, video: 0, total: results.length })
}

const tabs = (wrapper) => wrapper.findAll('.tabs .btn')
const text = (wrapper, selector) => wrapper.find(selector).text()

describe('ItemsView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mockList()
  })

  it('shows the tiles, the result line and the per-type counts', async () => {
    const { wrapper } = await mountView(ItemsView)
    expect(wrapper.findAll('.caption').map((c) => c.text())).toEqual(['Dancing owl', 'Untitled'])
    expect(text(wrapper, '.results__text')).toBe('2 items')
    expect(tabs(wrapper).map((t) => t.text())).toEqual(['GIFs 1', 'Memes 1', 'Videos 0'])
    expect(text(wrapper, '.more')).toBe('All 2 items shown')
    expect(wrapper.find('h1').text()).toBe('GifMeCollector')
  })

  it('uses the singular for a single item', async () => {
    mockList([items[0]])
    const { wrapper } = await mountView(ItemsView)
    expect(text(wrapper, '.results__text')).toBe('1 item')
  })

  it('filters by type from a tab, shows it as pressed and puts it in the URL', async () => {
    const { wrapper, router } = await mountView(ItemsView)
    await tabs(wrapper)[0].trigger('click')
    await flushPromises()
    expect(tabs(wrapper)[0].attributes('aria-pressed')).toBe('true')
    expect(router.currentRoute.value.query).toEqual({ type: 'gif' })
    expect(api.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ type: 'gif' }))
    expect(text(wrapper, '.results__text')).toBe('2 items (GIFs)')
    await tabs(wrapper)[0].trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('restores the filters from the URL and offers removable chips', async () => {
    const { wrapper } = await mountView(ItemsView, { route: '/?q=cat&tag=owl&sort=oldest' })
    expect(api.listItems).toHaveBeenCalledWith({ type: undefined, q: 'cat', tag: ['owl'], ordering: 'oldest' })
    const chips = wrapper.findAll('.chip--filter')
    expect(chips.map((c) => c.text())).toEqual(['Search: “cat”', '#owl'])
    expect(chips[1].attributes('aria-label')).toBe('Remove filter #owl')
    expect(wrapper.find('#sort').element.value).toBe('oldest')
  })

  it('removes a tag chip and reloads', async () => {
    const { wrapper, router } = await mountView(ItemsView, { route: '/?tag=owl' })
    await wrapper.find('.chip--filter').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
    expect(wrapper.findAll('.chip--filter')).toHaveLength(0)
    expect(api.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ tag: undefined }))
  })

  it('"Reset all filters" clears everything but the sort order', async () => {
    const { wrapper, router } = await mountView(ItemsView, { route: '/?type=gif&q=cat&tag=owl&sort=largest' })
    expect(wrapper.find('.linkbtn').text()).toBe('Reset all filters')
    await wrapper.find('.linkbtn').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ sort: 'largest' })
    expect(wrapper.find('.linkbtn').exists()).toBe(false)
  })

  it('searches after a short pause and reloads with the text', async () => {
    vi.useFakeTimers()
    try {
      const { wrapper } = await mountView(ItemsView)
      api.listItems.mockClear()
      await wrapper.find('#search').setValue('owl')
      await vi.advanceTimersByTimeAsync(299)
      expect(api.listItems).not.toHaveBeenCalled()
      await vi.advanceTimersByTimeAsync(2)
      await flushPromises()
      expect(api.listItems).toHaveBeenCalledWith(expect.objectContaining({ q: 'owl' }))
      expect(wrapper.find('.chip--filter').text()).toBe('Search: “owl”')
    } finally {
      vi.useRealTimers()
    }
  })

  it('sorts via the select', async () => {
    const { wrapper, router } = await mountView(ItemsView)
    const options = wrapper.findAll('#sort option').map((o) => o.text())
    expect(options).toEqual(['Newest first', 'Oldest first', 'Largest first'])
    await wrapper.find('#sort').setValue('largest')
    await flushPromises()
    expect(api.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ ordering: 'largest' }))
    expect(router.currentRoute.value.query).toEqual({ sort: 'largest' })
  })

  it('filters by the tag chip on a tile', async () => {
    const { wrapper, router } = await mountView(ItemsView)
    await wrapper.find('button.tile__tag').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({ tag: ['owl'] })
  })

  it('jumps into the search field with the slash key', async () => {
    const { wrapper } = await mountView(ItemsView, { attachTo: document.body })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(wrapper.find('#search').element)
    wrapper.unmount()
  })

  it('does not steal the slash key while typing or with modifiers', async () => {
    const { wrapper } = await mountView(ItemsView, { attachTo: document.body })
    const select = wrapper.find('#sort').element
    select.focus()
    select.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))
    expect(document.activeElement).toBe(select)
    document.body.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', ctrlKey: true, bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(wrapper.find('#search').element)
    wrapper.unmount()
  })

  it('stops listening for the slash key after it is unmounted', async () => {
    const { wrapper } = await mountView(ItemsView, { attachTo: document.body })
    const input = wrapper.find('#search').element
    wrapper.unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }))
    expect(document.activeElement).not.toBe(input)
  })

  it('toggles autoplay, shows its state in words and remembers it', async () => {
    const { wrapper } = await mountView(ItemsView)
    const button = wrapper.find('.btn--yellow')
    expect(button.text()).toBe('Autoplay: Off')
    expect(button.attributes('aria-pressed')).toBe('false')
    await button.trigger('click')
    expect(button.text()).toBe('Autoplay: On')
    expect(button.attributes('aria-pressed')).toBe('true')
    expect(localStorage.getItem('gifme.autoplay')).toBe('1')
    expect(wrapper.find('.tile img').attributes('src')).toBe('/media/items/aa/1.gif')
  })

  it('explains that autoplay stays off when the system asks for reduced motion', async () => {
    localStorage.setItem('gifme.autoplay', '1')
    window.matchMedia.mockReturnValue({ matches: true })
    const { wrapper } = await mountView(ItemsView)
    expect(wrapper.find('.motion-hint').text()).toMatch(/reduced motion/)
    expect(wrapper.find('.btn--yellow').attributes('aria-pressed')).toBe('false')
    window.matchMedia.mockReturnValue({ matches: false })
  })

  it('shows a loading note and placeholders before the first answer', async () => {
    let finish
    api.listItems.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const { wrapper } = await mountView(ItemsView)
    expect(text(wrapper, '.results__text')).toBe('Loading collection …')
    expect(wrapper.findAll('.skeleton')).toHaveLength(10)
    finish(page(items))
    await flushPromises()
    expect(wrapper.findAll('.skeleton')).toHaveLength(0)
  })

  it('shows an error with a retry button', async () => {
    api.listItems.mockRejectedValueOnce(new ApiError('The server cannot be reached. Is the backend running?'))
    const { wrapper } = await mountView(ItemsView)
    const notice = wrapper.find('.notice--error')
    expect(notice.attributes('role')).toBe('alert')
    expect(notice.text()).toContain('Error: The server cannot be reached. Is the backend running?')
    expect(wrapper.find('.results__text').text()).toBe('')
    await notice.find('button').trigger('click')
    await flushPromises()
    expect(wrapper.find('.notice--error').exists()).toBe(false)
    expect(wrapper.findAll('.caption')).toHaveLength(2)
  })

  it('invites you to add the first item when the collection is empty', async () => {
    mockList([])
    const { wrapper } = await mountView(ItemsView)
    expect(wrapper.find('.empty').text()).toContain('Your collection is still empty.')
    const link = wrapper.find('.empty a')
    expect(link.text()).toBe('Add your first item')
    expect(link.attributes('href')).toBe('/add')
  })

  it('says there are no matches when a filter finds nothing and offers a reset', async () => {
    mockList([])
    const { wrapper, router } = await mountView(ItemsView, { route: '/?q=zzz' })
    expect(wrapper.find('.empty').text()).toContain('No matches for this selection.')
    await wrapper.find('.empty button').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('loads the next page on demand and reports progress', async () => {
    mockList(items, { count: 3, next: '/api/items/?page=2' })
    const { wrapper } = await mountView(ItemsView)
    expect(text(wrapper, '.more .hint')).toBe('2 of 3 shown')
    api.listItems.mockResolvedValueOnce(page([makeItem({ id: 3, title: 'Third' })], { count: 3, next: null }))
    await wrapper.find('.more .btn').trigger('click')
    await flushPromises()
    expect(api.listItems).toHaveBeenLastCalledWith(expect.objectContaining({ page: 2 }))
    expect(wrapper.findAll('.caption')).toHaveLength(3)
    expect(text(wrapper, '.more')).toBe('All 3 items shown')
  })

  it('has an Add button that leads to the add page', async () => {
    const { wrapper } = await mountView(ItemsView)
    const add = wrapper.findAll('.toolbar a').find((a) => a.text() === 'Add')
    expect(add.attributes('href')).toBe('/add')
  })

  it('labels the search field for assistive technology', async () => {
    const { wrapper } = await mountView(ItemsView)
    expect(wrapper.find('label[for="search"]').text()).toMatch(/Search by text or tag/)
    expect(wrapper.find('label[for="sort"]').text()).toBe('Sort order')
    expect(wrapper.find('.tabs').attributes('aria-label')).toBe('Filter by type')
  })
})
