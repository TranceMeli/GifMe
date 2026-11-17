import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/client'
import * as api from '@/api/items'
import { deferred, makeItem, mountView } from '@/test/helpers'
import AddView from './AddView.vue'

vi.mock('@/api/items')

const png = (name = 'a.png') => new File(['x'], name, { type: 'image/png' })
const gif = (name = 'b.gif') => new File(['x'], name, { type: 'image/gif' })
const mp4 = (name = 'c.mp4') => new File(['x'], name, { type: 'video/mp4' })

async function pick(wrapper, ...files) {
  const input = wrapper.find('input[type="file"]')
  Object.defineProperty(input.element, 'files', { value: files, configurable: true })
  await input.trigger('change')
}

const rows = (wrapper) => wrapper.findAll('.row')
const saveButton = (wrapper) => wrapper.find('.footer .btn--primary')

describe('AddView', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    api.createItem.mockResolvedValue(makeItem())
  })

  it('starts with a drop zone, a link field and no list', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    expect(wrapper.find('h1').text()).toBe('Add')
    expect(wrapper.text()).toContain('Drag files here')
    expect(wrapper.text()).toContain('Or paste a copied image with Ctrl+V')
    expect(wrapper.find('.queue').exists()).toBe(false)
    expect(wrapper.find('nav[aria-label="Breadcrumb"]').text()).toContain('Collection')
  })

  it('adds picked files with a guessed type and a thumbnail preview', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png(), gif(), mp4())
    expect(rows(wrapper).map((r) => r.find('.row__name').text())).toEqual(['a.png', 'b.gif', 'c.mp4'])
    expect(rows(wrapper).map((r) => r.find('select').element.value)).toEqual(['meme', 'gif', 'video'])
    expect(rows(wrapper)[0].find('img').exists()).toBe(true)
    expect(rows(wrapper)[2].find('img').exists()).toBe(false)
    expect(saveButton(wrapper).text()).toBe('Save 3 items')
  })

  it('leaves the type of a WebP to the server', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, new File(['x'], 'a.webp', { type: 'image/webp' }))
    expect(rows(wrapper)[0].find('select').element.value).toBe('')
  })

  it('skips unsupported files and says which ones', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png(), new File(['x'], 'notes.txt', { type: 'text/plain' }), new File(['x'], 'doc.pdf', { type: 'application/pdf' }))
    expect(rows(wrapper)).toHaveLength(1)
    expect(wrapper.find('.notice').text()).toContain('Unsupported and skipped: notes.txt, doc.pdf.')
    expect(wrapper.find('.notice').text()).toContain('GIF, PNG, JPG, WebP, MP4 and WebM')
  })

  it('accepts files dropped onto the zone and highlights it while dragging', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    const zone = wrapper.find('.drop')
    await zone.trigger('dragover')
    expect(zone.classes()).toContain('drop--active')
    await zone.trigger('dragleave')
    expect(zone.classes()).not.toContain('drop--active')
    const drop = new Event('drop', { bubbles: true, cancelable: true })
    drop.dataTransfer = { files: [gif('dropped.gif')] }
    zone.element.dispatchEvent(drop)
    await flushPromises()
    expect(rows(wrapper)[0].find('.row__name').text()).toBe('dropped.gif')
  })

  it('adds an image pasted from the clipboard', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add', attachTo: document.body })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    paste.clipboardData = { files: [new File(['x'], 'image.png', { type: 'image/png' })] }
    window.dispatchEvent(paste)
    await flushPromises()
    expect(rows(wrapper)[0].find('.row__name').text()).toBe('pasted-1.png')
    wrapper.unmount()
  })

  it('ignores a paste without files so text can still be pasted', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add', attachTo: document.body })
    const paste = new Event('paste', { bubbles: true, cancelable: true })
    paste.clipboardData = { files: [] }
    window.dispatchEvent(paste)
    await flushPromises()
    expect(paste.defaultPrevented).toBe(false)
    expect(rows(wrapper)).toHaveLength(0)
    wrapper.unmount()
  })

  it('validates links before adding them', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    const submit = async (value) => {
      await wrapper.find('#link').setValue(value)
      await wrapper.find('form.link').trigger('submit')
    }
    await submit('not a link')
    expect(wrapper.find('#link-error').text()).toBe('Error: Please enter a valid link.')
    await submit('ftp://example.com/a.gif')
    expect(wrapper.find('#link-error').text()).toBe('Error: Only http and https links are allowed.')
    expect(rows(wrapper)).toHaveLength(0)
    await submit('https://example.com/media/funny%20cat.gif')
    expect(wrapper.find('#link-error').text()).toBe('')
    expect(rows(wrapper)[0].find('.row__name').text()).toBe('funny cat.gif')
    expect(rows(wrapper)[0].find('select').element.value).toBe('gif')
    expect(wrapper.find('#link').element.value).toBe('')
  })

  it('has a "Load" button that explains instead of being disabled', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    const button = wrapper.find('form.link button')
    expect(button.text()).toBe('Load')
    expect(button.attributes('disabled')).toBeUndefined()
    await wrapper.find('form.link').trigger('submit')
    expect(wrapper.find('#link-error').text()).toContain('Please enter a valid link.')
  })

  it('removes a row again', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png(), gif())
    await rows(wrapper)[0].find('.btn--icon').trigger('click')
    expect(rows(wrapper).map((r) => r.find('.row__name').text())).toEqual(['b.gif'])
    expect(saveButton(wrapper).text()).toBe('Save 1 item')
  })

  it('uploads every entry with its type and tags, then returns to the overview', async () => {
    const { wrapper, router } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png(), gif())
    await rows(wrapper)[0].find('select').setValue('gif')
    await rows(wrapper)[0].find('input[type="text"]').setValue('funny, cat')
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.createItem).toHaveBeenCalledTimes(2)
    expect(api.createItem.mock.calls[0][0]).toMatchObject({ type: 'gif', tags: 'funny, cat' })
    expect(api.createItem.mock.calls[0][0].file.name).toBe('a.png')
    expect(router.currentRoute.value.name).toBe('items')
  })

  it('sends a link entry as URL', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await wrapper.find('#link').setValue('https://example.com/a.gif')
    await wrapper.find('form.link').trigger('submit')
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.createItem).toHaveBeenCalledWith(expect.objectContaining({ url: 'https://example.com/a.gif', type: 'gif' }))
  })

  it('shows progress while saving and blocks a second click', async () => {
    const reply = deferred()
    api.createItem.mockReturnValue(reply.promise)
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png())
    await saveButton(wrapper).trigger('click')
    expect(saveButton(wrapper).text()).toBe('Saving …')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(rows(wrapper)[0].find('.row__note').text()).toBe('Saving …')
    reply.resolve(makeItem())
    await flushPromises()
  })

  it('marks a duplicate with text and a link, and skips it from then on', async () => {
    api.createItem.mockRejectedValueOnce(new ApiError('dup', { status: 409, code: 'duplicate', data: { existing_id: 42 } }))
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png(), gif())
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(rows(wrapper)).toHaveLength(1)
    const note = rows(wrapper)[0].find('.row__note--error')
    expect(note.attributes('role')).toBe('alert')
    expect(note.text()).toContain('This file is already in your collection.')
    expect(note.find('a').text()).toBe('Go to the existing item')
    expect(note.find('a').attributes('href')).toBe('/items/42')
    expect(wrapper.find('.notice').text()).toContain('Some files could not be saved')
    expect(wrapper.find('.footer__hint').text()).toBe('One file is already in your collection and will be skipped.')
    expect(saveButton(wrapper).text()).toBe('Save')
  })

  it('explains instead of doing nothing when only duplicates are left', async () => {
    api.createItem.mockRejectedValueOnce(new ApiError('dup', { status: 409, code: 'duplicate', data: { existing_id: 1 } }))
    const { wrapper } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png())
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    api.createItem.mockClear()
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.createItem).not.toHaveBeenCalled()
    expect(wrapper.find('.notice').text()).toContain('Everything in the list is already in your collection.')
  })

  it('keeps a failed entry so it can be retried', async () => {
    api.createItem.mockRejectedValueOnce(new ApiError('The file is larger than the limit of 100 MB.', { status: 413, code: 'file_too_large' }))
    const { wrapper, router } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png())
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(rows(wrapper)[0].find('.row__note--error').text()).toContain('The file is larger than the limit of 100 MB.')
    expect(router.currentRoute.value.name).toBe('add')
    expect(saveButton(wrapper).text()).toBe('Save 1 item')
    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(api.createItem).toHaveBeenCalledTimes(2)
    expect(router.currentRoute.value.name).toBe('items')
  })

  it('cancel leaves without uploading anything', async () => {
    const { wrapper, router } = await mountView(AddView, { route: '/add' })
    await pick(wrapper, png())
    await wrapper.findAll('.footer .btn').find((b) => b.text() === 'Cancel').trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.name).toBe('items')
    expect(api.createItem).not.toHaveBeenCalled()
  })

  it('labels optional fields as optional and gives the row controls names', async () => {
    const { wrapper } = await mountView(AddView, { route: '/add' })
    expect(wrapper.find('label[for="link"]').text()).toBe('Load from link (optional)')
    await pick(wrapper, png())
    expect(wrapper.find('.row select').attributes('id')).toMatch(/^type-/)
    expect(wrapper.find('.row label.sr-only').text()).toBe('Type for a.png')
    expect(wrapper.find('.row input[type="text"]').attributes('placeholder')).toBe('Tags (optional)')
    expect(wrapper.find('.row .btn--icon').attributes('aria-label')).toBe('Remove a.png from the list')
  })
})
