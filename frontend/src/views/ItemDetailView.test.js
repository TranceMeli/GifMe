import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as api from '@/api/items'
import { copyItem, copyLink } from '@/utils/clipboard'
import { makeItem, mountView } from '@/test/helpers'
import ItemDetailView from './ItemDetailView.vue'

vi.mock('@/api/items')
vi.mock('@/utils/clipboard')

async function open(item = makeItem({ id: 7, title: 'Dancing owl', tags: ['owl'] }), options = {}) {
  api.getItem.mockResolvedValue(item)
  return mountView(ItemDetailView, { route: `/items/${item.id}`, props: { id: String(item.id) }, ...options })
}

const action = (wrapper, label) => wrapper.findAll('.actions .btn').find((b) => b.text().includes(label))

describe('ItemDetailView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('shows the item with its properties and a breadcrumb path', async () => {
    const { wrapper } = await open()
    expect(api.getItem).toHaveBeenCalledWith('7')
    expect(wrapper.find('#title').element.value).toBe('Dancing owl')
    expect(wrapper.find('.preview img').attributes('src')).toBe('/media/items/aa/1.gif')
    expect(wrapper.find('.preview__badge').text()).toBe('GIF')
    expect(wrapper.findAll('.tags .tag').map((t) => t.text())).toEqual(['#owl'])
    const meta = wrapper.find('.meta').text()
    expect(meta).toContain('480 × 270 px')
    expect(meta).toContain('1.2 MB')
    expect(meta).toContain('07/11/2026')
    const crumbs = wrapper.find('.crumbs')
    expect(crumbs.findAll('a').map((a) => a.text())).toEqual(['Collection', 'GIFs'])
    expect(crumbs.findAll('a')[1].attributes('href')).toBe('/?type=gif')
    expect(crumbs.find('.crumbs__current').text()).toBe('Dancing owl')
  })

  it('names an untitled item "Untitled" in the path and the alt text', async () => {
    const { wrapper } = await open(makeItem({ id: 7, title: '' }))
    expect(wrapper.find('.crumbs__current').text()).toBe('Untitled')
    expect(wrapper.find('.preview img').attributes('alt')).toBe('Untitled GIF')
  })

  it('uses a video player for videos', async () => {
    const { wrapper } = await open(makeItem({ id: 7, type: 'video', file_url: '/media/items/aa/1.mp4' }))
    expect(wrapper.find('video').attributes('src')).toBe('/media/items/aa/1.mp4')
    expect(wrapper.find('video').attributes('poster')).toBe('/media/thumbs/1.jpg')
    expect(wrapper.find('.preview img').exists()).toBe(false)
  })

  it('shows an error when the item cannot be loaded', async () => {
    api.getItem.mockRejectedValue(new ApiError('The item was not found.', { status: 404 }))
    const { wrapper } = await mountView(ItemDetailView, { route: '/items/9', props: { id: '9' } })
    expect(wrapper.find('.notice--error').text()).toContain('Error: The item was not found.')
    expect(wrapper.find('.detail').exists()).toBe(false)
  })

  it('offers a download of the original file', async () => {
    const { wrapper } = await open()
    const link = action(wrapper, 'Download')
    expect(link.attributes('href')).toBe('/media/items/aa/1.gif')
    expect(link.attributes('download')).toBeDefined()
  })

  describe('copying', () => {
    it('shows what was copied', async () => {
      copyItem.mockResolvedValue('GIF link copied (GIFs are always copied as a link). Download the file to share it.')
      copyLink.mockResolvedValue('File link copied. It only works on this computer; download the file to share it.')
      const { wrapper } = await open()
      await action(wrapper, 'Copy to clipboard').trigger('click')
      await flushPromises()
      expect(copyItem).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }))
      expect(wrapper.find('.feedback').text()).toContain('GIF link copied')
      await action(wrapper, 'Copy link').trigger('click')
      await flushPromises()
      expect(copyLink).toHaveBeenCalled()
      expect(wrapper.find('.feedback').text()).toContain('File link copied.')
    })

    it('reports a blocked clipboard as an error', async () => {
      copyItem.mockRejectedValue(new Error('denied'))
      const { wrapper } = await open()
      await action(wrapper, 'Copy to clipboard').trigger('click')
      await flushPromises()
      const feedback = wrapper.find('.feedback')
      expect(feedback.attributes('role')).toBe('alert')
      expect(feedback.text()).toBe('Error: Copying was blocked by the browser. Please check the clipboard permission.')
    })
  })

  describe('editing properties', () => {
    it('saves the title when the field loses focus and says so', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, title: 'Renamed' }))
      const { wrapper } = await open()
      await wrapper.find('#title').setValue('Renamed')
      await wrapper.find('#title').trigger('blur')
      await flushPromises()
      expect(api.updateItem).toHaveBeenCalledWith(7, { title: 'Renamed' })
      expect(wrapper.find('.feedback').text()).toBe('Saved.')
      expect(wrapper.find('.crumbs__current').text()).toBe('Renamed')
    })

    it('does not call the server when nothing changed', async () => {
      const { wrapper } = await open()
      await wrapper.find('#title').trigger('blur')
      await wrapper.find('#source').trigger('blur')
      expect(api.updateItem).not.toHaveBeenCalled()
    })

    it('trims the title and saves the source link', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, source_url: 'https://e.example/a' }))
      const { wrapper } = await open()
      await wrapper.find('#title').setValue('  Dancing owl  ')
      await wrapper.find('#title').trigger('blur')
      expect(api.updateItem).not.toHaveBeenCalled()
      await wrapper.find('#source').setValue('https://e.example/a')
      await wrapper.find('#source').trigger('blur')
      await flushPromises()
      expect(api.updateItem).toHaveBeenCalledWith(7, { source_url: 'https://e.example/a' })
    })

    it('puts the previous value back and shows the error when saving fails', async () => {
      api.updateItem.mockRejectedValue(new ApiError('Could not save.'))
      const { wrapper } = await open()
      await wrapper.find('#title').setValue('Broken')
      await wrapper.find('#title').trigger('blur')
      await flushPromises()
      expect(wrapper.find('#title').element.value).toBe('Dancing owl')
      expect(wrapper.find('.feedback').text()).toBe('Error: Could not save.')
    })

    it('adds tags on Enter and on comma, several at once', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, tags: ['owl', 'night', 'bird'] }))
      const { wrapper } = await open()
      const input = wrapper.find('#new-tag')
      await input.setValue('night, bird')
      await input.trigger('keydown', { key: 'Enter' })
      await flushPromises()
      expect(api.updateItem).toHaveBeenCalledWith(7, { tags: ['owl', 'night', 'bird'] })
      expect(wrapper.find('.feedback').text()).toBe('Tag added.')
      expect(input.element.value).toBe('')
      await input.setValue('x')
      await input.trigger('keydown', { key: ',' })
      await flushPromises()
      expect(api.updateItem).toHaveBeenLastCalledWith(7, { tags: ['owl', 'night', 'bird', 'x'] })
    })

    it('ignores an empty tag field', async () => {
      const { wrapper } = await open()
      await wrapper.find('#new-tag').trigger('keydown', { key: 'Enter' })
      expect(api.updateItem).not.toHaveBeenCalled()
    })

    it('removes a tag with its own button', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, tags: [] }))
      const { wrapper } = await open(makeItem({ id: 7, tags: ['owl', 'bird'] }))
      const button = wrapper.find('button[aria-label="Remove tag #owl"]')
      await button.trigger('click')
      await flushPromises()
      expect(api.updateItem).toHaveBeenCalledWith(7, { tags: ['bird'] })
      expect(wrapper.find('.feedback').text()).toBe('Tag #owl removed.')
    })

    it('swaps gif and meme but keeps videos as videos', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, type: 'meme' }))
      const { wrapper } = await open()
      const pills = wrapper.findAll('.pills .btn')
      expect(pills.map((p) => [p.text(), p.attributes('aria-pressed'), p.attributes('disabled') !== undefined])).toEqual([
        ['GIF', 'true', false],
        ['Meme', 'false', false],
        ['Video', 'false', true],
      ])
      expect(pills[2].attributes('title')).toBe('Does not match the file content')
      await pills[1].trigger('click')
      await flushPromises()
      expect(api.updateItem).toHaveBeenCalledWith(7, { type: 'meme' })
    })

    it('only allows video for video files', async () => {
      const { wrapper } = await open(makeItem({ id: 7, type: 'video' }))
      const pills = wrapper.findAll('.pills .btn')
      expect(pills.map((p) => p.attributes('disabled') !== undefined)).toEqual([true, true, false])
    })

    it('does not save when the clicked type is already active', async () => {
      const { wrapper } = await open()
      await wrapper.findAll('.pills .btn')[0].trigger('click')
      expect(api.updateItem).not.toHaveBeenCalled()
    })

    it('labels optional fields as optional', async () => {
      const { wrapper } = await open()
      for (const id of ['title', 'new-tag', 'source']) {
        expect(wrapper.find(`label[for="${id}"]`).text()).toContain('(optional)')
      }
      expect(wrapper.find('.detail__form p.hint').text()).toBe('Changes are saved when you leave a field.')
    })
  })

  describe('favorite', () => {
    it('turns the star on and tells the user', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, is_favorite: true }))
      const { wrapper } = await open()
      const button = action(wrapper, 'Favorite')
      expect(button.attributes('aria-pressed')).toBe('false')
      await button.trigger('click')
      await flushPromises()
      expect(button.attributes('aria-pressed')).toBe('true')
      expect(wrapper.find('.feedback').text()).toBe('Added to favorites.')
    })

    it('turns it off again', async () => {
      api.updateItem.mockResolvedValue(makeItem({ id: 7, is_favorite: false }))
      const { wrapper } = await open(makeItem({ id: 7, is_favorite: true }))
      await action(wrapper, 'Favorite').trigger('click')
      await flushPromises()
      expect(wrapper.find('.feedback').text()).toBe('Removed from favorites.')
    })

    it('rolls back and shows an error when the server fails', async () => {
      api.updateItem.mockRejectedValue(new ApiError('Offline.'))
      const { wrapper } = await open()
      await action(wrapper, 'Favorite').trigger('click')
      await flushPromises()
      expect(action(wrapper, 'Favorite').attributes('aria-pressed')).toBe('false')
      expect(wrapper.find('.feedback').text()).toBe('Error: Offline.')
    })
  })

  describe('edit and delete', () => {
    it('links to the editor for gifs and images but not for videos', async () => {
      const gifPage = await open(makeItem({ id: 7 }))
      const link = gifPage.wrapper.find('.danger-row a')
      expect(link.text()).toBe('Edit')
      expect(link.attributes('href')).toBe('/items/7/edit')
      const videoPage = await open(makeItem({ id: 8, type: 'video' }))
      expect(videoPage.wrapper.find('.danger-row a').exists()).toBe(false)
    })

    it('asks before deleting, names the item and offers editing instead', async () => {
      const { wrapper } = await open()
      const dialog = wrapper.find('dialog')
      expect(dialog.attributes('open')).toBeUndefined()
      await wrapper.find('.danger-row .btn--danger').trigger('click')
      expect(dialog.attributes('open')).toBeDefined()
      expect(dialog.find('h2').text()).toBe('Delete “Dancing owl”?')
      expect(dialog.text()).toContain('This cannot be undone.')
      expect(dialog.text()).toContain('Editing is the better choice.')
      expect(dialog.find('a').attributes('href')).toBe('/items/7/edit')
      expect(api.deleteItem).not.toHaveBeenCalled()
    })

    it('does not offer editing in the dialog for a video', async () => {
      const { wrapper } = await open(makeItem({ id: 8, type: 'video', title: 'Clip' }))
      const dialog = wrapper.find('dialog')
      expect(dialog.find('a').exists()).toBe(false)
      expect(dialog.text()).not.toContain('Editing is the better choice.')
    })

    it('cancel closes the dialog without deleting', async () => {
      const { wrapper } = await open()
      await wrapper.find('.danger-row .btn--danger').trigger('click')
      await wrapper.findAll('dialog .btn').find((b) => b.text() === 'Cancel').trigger('click')
      expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
      expect(api.deleteItem).not.toHaveBeenCalled()
    })

    it('deletes after confirmation and returns to the overview', async () => {
      api.deleteItem.mockResolvedValue(null)
      const { wrapper, router } = await open()
      await wrapper.find('.danger-row .btn--danger').trigger('click')
      await wrapper.findAll('dialog .btn').find((b) => b.text() === 'Delete permanently').trigger('click')
      await flushPromises()
      expect(api.deleteItem).toHaveBeenCalledWith(7)
      expect(router.currentRoute.value.name).toBe('items')
    })

    it('shows an error when deleting fails and stays on the page', async () => {
      api.deleteItem.mockRejectedValue(new ApiError('Could not delete.'))
      const { wrapper, router } = await open()
      await wrapper.find('.danger-row .btn--danger').trigger('click')
      await wrapper.findAll('dialog .btn').find((b) => b.text() === 'Delete permanently').trigger('click')
      await flushPromises()
      expect(wrapper.find('.feedback').text()).toBe('Error: Could not delete.')
      expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
      expect(router.currentRoute.value.name).toBe('item')
    })
  })
})
