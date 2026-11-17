import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as api from './items'

vi.mock('./client', () => ({ request: vi.fn().mockResolvedValue({}) }))
import { request } from './client'

describe('items api', () => {
  beforeEach(() => {
    request.mockClear()
  })

  it('lists, counts and reads items', async () => {
    await api.listItems({ type: 'gif' })
    await api.getCounts({ q: 'x' })
    await api.getItem(7)
    expect(request).toHaveBeenNthCalledWith(1, '/items/', { params: { type: 'gif' } })
    expect(request).toHaveBeenNthCalledWith(2, '/items/counts/', { params: { q: 'x' } })
    expect(request).toHaveBeenNthCalledWith(3, '/items/7/')
  })

  it('uploads a file as multipart form data with only the filled fields', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await api.createItem({ file, type: 'meme', title: 'T', tags: 'a,b', sourceUrl: 'https://e.example' })
    const [path, options] = request.mock.calls[0]
    expect(path).toBe('/items/')
    expect(options.method).toBe('POST')
    expect(options.body).toBeInstanceOf(FormData)
    expect(options.body.get('file')).toBeInstanceOf(File)
    expect(options.body.get('type')).toBe('meme')
    expect(options.body.get('title')).toBe('T')
    expect(options.body.get('tags')).toBe('a,b')
    expect(options.body.get('source_url')).toBe('https://e.example')
  })

  it('omits empty optional fields in the upload', async () => {
    await api.createItem({ file: new File(['x'], 'a.png'), type: '', tags: '' })
    const form = request.mock.calls[0][1].body
    expect([...form.keys()]).toEqual(['file'])
  })

  it('imports from a link as JSON and splits the tags', async () => {
    await api.createItem({ url: 'https://e.example/a.gif', type: '', title: 'T', tags: 'x,y' })
    expect(request).toHaveBeenCalledWith('/items/', {
      method: 'POST',
      json: { url: 'https://e.example/a.gif', type: undefined, title: 'T', tags: ['x', 'y'] },
    })
  })

  it('patches and deletes items', async () => {
    await api.updateItem(3, { title: 'New' })
    await api.deleteItem(3)
    expect(request).toHaveBeenNthCalledWith(1, '/items/3/', { method: 'PATCH', json: { title: 'New' } })
    expect(request).toHaveBeenNthCalledWith(2, '/items/3/', { method: 'DELETE' })
  })

  it('talks to the tag and edit endpoints', async () => {
    await api.listTags()
    await api.getEditInfo(5)
    await api.previewEdit(5, { speed: 2 })
    await api.saveEdit(5, { speed: 2 }, 'replace')
    expect(request).toHaveBeenNthCalledWith(1, '/tags/')
    expect(request).toHaveBeenNthCalledWith(2, '/items/5/edit-info/')
    expect(request).toHaveBeenNthCalledWith(3, '/items/5/edit/preview/', { method: 'POST', json: { speed: 2 }, blob: true })
    expect(request).toHaveBeenNthCalledWith(4, '/items/5/edit/', { method: 'POST', json: { speed: 2, mode: 'replace' } })
  })
})
