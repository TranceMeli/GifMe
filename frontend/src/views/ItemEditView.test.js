import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as api from '@/api/items'
import { deferred, makeItem, mountView } from '@/test/helpers'
import ItemEditView from './ItemEditView.vue'

vi.mock('@/api/items')

const animatedInfo = { frame_count: 50, duration_ms: 4040, width: 540, height: 756 }
const stillInfo = { frame_count: 1, duration_ms: 0, width: 540, height: 756 }
const baseItem = () => makeItem({ id: 7, title: 'Owl', size_bytes: 2072692, width: 540, height: 756 })

async function open({ item = baseItem(), info = animatedInfo } = {}) {
  api.getItem.mockResolvedValue(item)
  api.getEditInfo.mockResolvedValue(info)
  return mountView(ItemEditView, { route: `/items/${item.id}/edit`, props: { id: String(item.id) } })
}

async function move(wrapper, selector, value) {
  await wrapper.find(selector).setValue(value)
}

const bar = (wrapper) => wrapper.find('.actionbar')
const barButton = (wrapper, label) => bar(wrapper).findAll('.btn').find((b) => b.text().includes(label))
const badge = (wrapper) => wrapper.find('.preview__badge').text()
const phase = (wrapper) => wrapper.find('.phase').text()

describe('ItemEditView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.useFakeTimers()
    api.previewEdit.mockResolvedValue(new Blob(['x'.repeat(2048)], { type: 'image/gif' }))
    api.saveEdit.mockResolvedValue({ id: 9 })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  async function settle(ms = 600) {
    await vi.advanceTimersByTimeAsync(ms)
    await flushPromises()
  }

  describe('loading', () => {
    it('shows the original, the tool groups and the facts about the file', async () => {
      const { wrapper } = await open()
      expect(api.getEditInfo).toHaveBeenCalledWith('7')
      expect(wrapper.find('h1').text()).toBe('Edit')
      expect(wrapper.find('.crumbs').text()).toContain('Owl')
      expect(badge(wrapper)).toBe('ORIGINAL')
      expect(phase(wrapper)).toBe('Original view. Change something and the preview appears here.')
      expect(wrapper.findAll('summary').map((s) => s.text())).toEqual(['Time range and speed', 'Crop', 'Rotation and size'])
      expect(wrapper.find('.card .hint').text()).toBe('50 frames, 4.04 s duration')
      expect(wrapper.find('output[for="start"]').text()).toBe('Frame 1 of 50')
      expect(wrapper.find('output[for="end"]').text()).toBe('Frame 50 of 50')
      expect(wrapper.find('.preview img').attributes('src')).toBe('/media/items/aa/1.gif')
    })

    it('opens the first two groups and keeps rotation and size closed', async () => {
      const { wrapper } = await open()
      expect(wrapper.findAll('details').map((d) => d.attributes('open') !== undefined)).toEqual([true, true, false])
    })

    it('hides the time controls for a still image', async () => {
      const { wrapper } = await open({ info: stillInfo })
      expect(wrapper.findAll('summary').map((s) => s.text())).toEqual(['Crop', 'Rotation and size'])
      expect(wrapper.find('#start').exists()).toBe(false)
      expect(wrapper.find('#speed').exists()).toBe(false)
    })

    it('shows a loading note first and an error when the editor data is unavailable', async () => {
      api.getItem.mockResolvedValue(baseItem())
      api.getEditInfo.mockRejectedValue(new ApiError('Videos cannot be edited yet.', { code: 'not_editable' }))
      const { wrapper } = await mountView(ItemEditView, { route: '/items/7/edit', props: { id: '7' } })
      expect(wrapper.find('.notice--error').text()).toContain('Error: Videos cannot be edited yet.')
      expect(wrapper.find('.edit').exists()).toBe(false)
    })

    it('has English labels for all controls', async () => {
      const { wrapper } = await open()
      const labels = wrapper.findAll('label').map((l) => l.text())
      expect(labels).toEqual(expect.arrayContaining(['Start', 'End', 'Speed', 'Crop left', 'Crop right', 'Crop top', 'Crop bottom', 'Rotate', 'Size']))
      expect(wrapper.findAll('#speed option').map((o) => o.text())).toEqual(['0.5×', '1× (Original)', '1.5×', '2×', '3×'])
      expect(wrapper.findAll('#rotate option').map((o) => o.text())).toEqual(['Do not rotate', '90° right', '180°', '90° left'])
      expect(wrapper.findAll('#scale option').map((o) => o.text())).toEqual(['Original', '75 %', '50 %', '25 %'])
    })
  })

  describe('frame range', () => {
    it('pushes the end forward when the start passes it', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#end', 10)
      await move(wrapper, '#start', 20)
      expect(wrapper.find('#end').element.value).toBe('20')
      expect(wrapper.find('output[for="start"]').text()).toBe('Frame 21 of 50')
      expect(wrapper.find('output[for="end"]').text()).toBe('Frame 21 of 50')
    })

    it('pulls the start back when the end drops below it', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#start', 30)
      await move(wrapper, '#end', 5)
      expect(wrapper.find('#start').element.value).toBe('5')
    })
  })

  describe('live preview', () => {
    it('waits for a pause, then asks the server once with all settings', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#crop-left', 10)
      expect(phase(wrapper)).toBe('Updating preview …')
      expect(api.previewEdit).not.toHaveBeenCalled()
      await settle(599)
      expect(api.previewEdit).not.toHaveBeenCalled()
      await settle(2)
      expect(api.previewEdit).toHaveBeenCalledTimes(1)
      expect(api.previewEdit).toHaveBeenCalledWith('7', {
        start: 0, end: 49, reverse: false, speed: 1, rotate: 0, scale: 100,
        crop: { left: 10, right: 0, top: 0, bottom: 0 },
      })
    })

    it('shows the result as a preview afterwards', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#speed', 2)
      await settle()
      expect(badge(wrapper)).toBe('PREVIEW')
      expect(wrapper.find('.preview img').attributes('src')).toBe('blob:preview')
      expect(phase(wrapper)).toBe('Preview with your changes. Nothing is saved until you use the buttons below.')
      expect(wrapper.find('.preview').attributes('aria-busy')).toBe('false')
    })

    it('restarts the wait on every change so a burst makes one request', async () => {
      const { wrapper } = await open()
      for (const value of [5, 10, 15, 20]) {
        await move(wrapper, '#crop-top', value)
        await vi.advanceTimersByTimeAsync(300)
      }
      await settle()
      expect(api.previewEdit).toHaveBeenCalledTimes(1)
      expect(api.previewEdit.mock.calls[0][1].crop.top).toBe(20)
    })

    it('omits the time settings for a still image', async () => {
      const { wrapper } = await open({ info: stillInfo })
      await move(wrapper, '#rotate', 90)
      await settle()
      expect(api.previewEdit).toHaveBeenCalledWith('7', { rotate: 90, scale: 100, crop: { left: 0, right: 0, top: 0, bottom: 0 } })
    })

    it('goes back to the original when every change is undone', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#scale', 50)
      await settle()
      expect(badge(wrapper)).toBe('PREVIEW')
      api.previewEdit.mockClear()
      await move(wrapper, '#scale', 100)
      await settle()
      expect(api.previewEdit).not.toHaveBeenCalled()
      expect(badge(wrapper)).toBe('ORIGINAL')
      expect(wrapper.find('.preview img').attributes('src')).toBe('/media/items/aa/1.gif')
    })

    it('ignores an answer that arrives after a newer change', async () => {
      const slow = deferred()
      api.previewEdit.mockReturnValueOnce(slow.promise).mockResolvedValueOnce(new Blob(['y']))
      const { wrapper } = await open()
      await move(wrapper, '#scale', 75)
      await settle()
      await move(wrapper, '#scale', 50)
      await settle()
      expect(api.previewEdit).toHaveBeenCalledTimes(2)
      const urlsBefore = URL.createObjectURL.mock.calls.length
      slow.resolve(new Blob(['late']))
      await flushPromises()
      expect(URL.createObjectURL.mock.calls.length).toBe(urlsBefore)
    })

    it('shows server errors with the word "Error"', async () => {
      api.previewEdit.mockRejectedValue(new ApiError('The crop leaves no image.', { code: 'invalid_edit' }))
      const { wrapper } = await open()
      await move(wrapper, '#crop-left', 45)
      await settle()
      const message = bar(wrapper).find('.message')
      expect(message.attributes('role')).toBe('alert')
      expect(message.text()).toBe('Error: The crop leaves no image.')
      expect(badge(wrapper)).toBe('ORIGINAL')
    })

    it('compares the new size with the old one once the picture has loaded', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#crop-left', 20)
      await settle()
      expect(wrapper.find('.result').exists()).toBe(false)
      const img = wrapper.find('.preview img')
      Object.defineProperty(img.element, 'currentSrc', { value: 'blob:preview', configurable: true })
      Object.defineProperty(img.element, 'naturalWidth', { value: 432, configurable: true })
      Object.defineProperty(img.element, 'naturalHeight', { value: 756, configurable: true })
      await img.trigger('load')
      const result = wrapper.find('.result')
      expect(result.attributes('aria-label')).toBe('Result compared with the original')
      expect(result.text()).toContain('New dimensions432 × 756 px')
      expect(result.text()).toContain('New size2.0 KB')
      expect(result.text()).toContain('Before540 × 756 px, 2.0 MB')
    })

    it('does not treat the load of the original picture as a preview result', async () => {
      const { wrapper } = await open()
      await wrapper.find('.preview img').trigger('load')
      expect(wrapper.find('.result').exists()).toBe(false)
    })
  })

  describe('crop frame', () => {
    it('shows the frame on the original while a crop slider has focus', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#crop-left', 10)
      await move(wrapper, '#crop-bottom', 25)
      await settle()
      expect(wrapper.find('.crop').exists()).toBe(false)
      const group = wrapper.findAll('.card__body')[1]
      await group.trigger('focusin')
      expect(wrapper.find('.crop').attributes('style')).toContain('inset: 0% 0% 25% 10%')
      expect(wrapper.find('.preview img').attributes('src')).toBe('/media/items/aa/1.gif')
      expect(badge(wrapper)).toBe('ORIGINAL')
      expect(phase(wrapper)).toBe('The frame shows what remains of the original.')
      await group.trigger('focusout', { relatedTarget: document.body })
      expect(wrapper.find('.crop').exists()).toBe(false)
      expect(wrapper.find('.preview img').attributes('src')).toBe('blob:preview')
    })

    it('keeps the frame while focus moves between sliders of the same group', async () => {
      const { wrapper } = await open()
      const group = wrapper.findAll('.card__body')[1]
      await group.trigger('focusin')
      await group.trigger('focusout', { relatedTarget: wrapper.find('#crop-right').element })
      expect(wrapper.find('.crop').exists()).toBe(true)
    })
  })

  describe('saving', () => {
    it('explains instead of saving when nothing has changed', async () => {
      const { wrapper } = await open()
      await barButton(wrapper, 'Save as copy').trigger('click')
      expect(api.saveEdit).not.toHaveBeenCalled()
      const message = bar(wrapper).find('.message')
      expect(message.text()).toBe('Nothing changed yet. Move a slider, then the result can be saved.')
      expect(message.attributes('role')).toBe('status')
      await barButton(wrapper, 'Replace original').trigger('click')
      expect(wrapper.find('dialog').attributes('open')).toBeUndefined()
    })

    it('keeps both buttons clickable', async () => {
      const { wrapper } = await open()
      expect(barButton(wrapper, 'Save as copy').attributes('disabled')).toBeUndefined()
      expect(barButton(wrapper, 'Replace original').attributes('disabled')).toBeUndefined()
      expect(wrapper.find('.replace__warn').text()).toBe('Overwrites the file permanently')
    })

    it('saves a copy and opens the new item', async () => {
      const { wrapper, router } = await open()
      await move(wrapper, '#reverse, input[type="checkbox"]', true)
      await barButton(wrapper, 'Save as copy').trigger('click')
      await flushPromises()
      expect(api.saveEdit).toHaveBeenCalledWith('7', expect.objectContaining({ reverse: true }), 'copy')
      expect(router.currentRoute.value.name).toBe('item')
      expect(router.currentRoute.value.params.id).toBe('9')
    })

    it('shows progress while saving', async () => {
      const reply = deferred()
      api.saveEdit.mockReturnValue(reply.promise)
      const { wrapper } = await open()
      await move(wrapper, '#scale', 50)
      await barButton(wrapper, 'Save as copy').trigger('click')
      expect(barButton(wrapper, 'Saving …').attributes('disabled')).toBeDefined()
      reply.resolve({ id: 9 })
      await flushPromises()
    })

    it('asks for confirmation before replacing the original', async () => {
      const { wrapper, router } = await open()
      await move(wrapper, '#scale', 50)
      await barButton(wrapper, 'Replace original').trigger('click')
      const dialog = wrapper.find('dialog')
      expect(dialog.attributes('open')).toBeDefined()
      expect(dialog.find('h2').text()).toBe('Replace the original?')
      expect(dialog.text()).toContain('Tip: “Save as copy” keeps both.')
      expect(api.saveEdit).not.toHaveBeenCalled()
      await dialog.findAll('.btn').find((b) => b.text() === 'Cancel').trigger('click')
      expect(dialog.attributes('open')).toBeUndefined()
      expect(api.saveEdit).not.toHaveBeenCalled()
      await barButton(wrapper, 'Replace original').trigger('click')
      await dialog.findAll('.btn').find((b) => b.text() === 'Replace').trigger('click')
      await flushPromises()
      expect(api.saveEdit).toHaveBeenCalledWith('7', expect.objectContaining({ scale: 50 }), 'replace')
      expect(router.currentRoute.value.name).toBe('item')
    })

    it('says so when the result equals an item that already exists', async () => {
      api.saveEdit.mockRejectedValue(new ApiError('dup', { status: 409, code: 'duplicate' }))
      const { wrapper, router } = await open()
      await move(wrapper, '#scale', 50)
      await barButton(wrapper, 'Save as copy').trigger('click')
      await flushPromises()
      expect(bar(wrapper).find('.message').text()).toBe('Error: The result is identical to an item already in your collection.')
      expect(router.currentRoute.value.name).toBe('edit')
    })

    it('shows other save errors as they come', async () => {
      api.saveEdit.mockRejectedValue(new ApiError('The server cannot be reached. Is the backend running?'))
      const { wrapper } = await open()
      await move(wrapper, '#scale', 50)
      await barButton(wrapper, 'Save as copy').trigger('click')
      await flushPromises()
      expect(bar(wrapper).find('.message').text()).toBe('Error: The server cannot be reached. Is the backend running?')
      expect(barButton(wrapper, 'Save as copy').attributes('disabled')).toBeUndefined()
    })
  })

  describe('reset and cleanup', () => {
    it('puts every control back and drops the preview', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#crop-left', 15)
      await move(wrapper, '#speed', 2)
      await move(wrapper, '#start', 10)
      await settle()
      await barButton(wrapper, 'Reset').trigger('click')
      await settle()
      expect(wrapper.find('#crop-left').element.value).toBe('0')
      expect(wrapper.find('#speed').element.value).toBe('1')
      expect(wrapper.find('#start').element.value).toBe('0')
      expect(wrapper.find('#end').element.value).toBe('49')
      expect(badge(wrapper)).toBe('ORIGINAL')
    })

    it('releases the preview picture when the page is left', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#scale', 50)
      await settle()
      wrapper.unmount()
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
    })

    it('does not call the server after it has been left during the pause', async () => {
      const { wrapper } = await open()
      await move(wrapper, '#scale', 50)
      wrapper.unmount()
      await settle()
      expect(api.previewEdit).not.toHaveBeenCalled()
    })
  })
})
