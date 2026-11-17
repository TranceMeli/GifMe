import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError, request } from './client'

function response(body, { status = 200, type = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? type : null) },
    json: async () => {
      if (body === undefined) throw new Error('no body')
      return body
    },
    blob: async () => new Blob(['image-bytes']),
  }
}

describe('request', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns the parsed JSON body', async () => {
    fetchMock.mockResolvedValue(response({ ok: true }))
    await expect(request('/items/')).resolves.toEqual({ ok: true })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/items/')
    expect(fetchMock.mock.calls[0][1].method).toBe('GET')
  })

  it('builds the query string, repeating arrays and skipping empty values', async () => {
    fetchMock.mockResolvedValue(response({}))
    await request('/items/', {
      params: { type: 'gif', tag: ['a', 'b'], q: '', page: undefined, favorite: null, ordering: 'oldest' },
    })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/items/?type=gif&tag=a&tag=b&ordering=oldest')
  })

  it('leaves the URL alone when every parameter is empty', async () => {
    fetchMock.mockResolvedValue(response({}))
    await request('/items/', { params: { q: '', tag: [] } })
    expect(fetchMock.mock.calls[0][0]).toBe('/api/items/')
  })

  it('sends JSON with a content type', async () => {
    fetchMock.mockResolvedValue(response({}))
    await request('/items/1/', { method: 'PATCH', json: { title: 'x' } })
    const init = fetchMock.mock.calls[0][1]
    expect(init.method).toBe('PATCH')
    expect(init.headers['Content-Type']).toBe('application/json')
    expect(init.body).toBe('{"title":"x"}')
  })

  it('sends FormData without a content type so the browser sets the boundary', async () => {
    fetchMock.mockResolvedValue(response({}))
    const body = new FormData()
    body.append('file', new Blob(['x']), 'a.png')
    await request('/items/', { method: 'POST', body })
    const init = fetchMock.mock.calls[0][1]
    expect(init.body).toBe(body)
    expect(init.headers['Content-Type']).toBeUndefined()
  })

  it('resolves to a Blob when asked to', async () => {
    fetchMock.mockResolvedValue(response(undefined, { type: 'image/gif' }))
    const blob = await request('/items/1/edit/preview/', { method: 'POST', json: {}, blob: true })
    expect(blob).toBeInstanceOf(Blob)
  })

  it('maps API errors to ApiError with message, status, code and data', async () => {
    fetchMock.mockResolvedValue(
      response({ detail: 'This file is already in your collection.', code: 'duplicate', existing_id: 4 }, { status: 409 }),
    )
    const error = await request('/items/', { method: 'POST', json: {} }).catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('This file is already in your collection.')
    expect(error.status).toBe(409)
    expect(error.code).toBe('duplicate')
    expect(error.data.existing_id).toBe(4)
  })

  it('falls back to the first field error', async () => {
    fetchMock.mockResolvedValue(response({ title: ['Too long.', 'Other'] }, { status: 400 }))
    const error = await request('/items/1/', { method: 'PATCH', json: {} }).catch((e) => e)
    expect(error.message).toBe('Too long.')
  })

  it('has readable fallbacks for status codes without a body', async () => {
    const cases = [
      [404, 'The item was not found.'],
      [413, 'The file is too large.'],
      [500, 'An error occurred on the server.'],
      [503, 'An error occurred on the server.'],
      [400, 'The request was not valid.'],
    ]
    for (const [status, message] of cases) {
      fetchMock.mockResolvedValue(response(undefined, { status, type: 'text/html' }))
      const error = await request('/items/').catch((e) => e)
      expect(error.message, String(status)).toBe(message)
      expect(error.status).toBe(status)
    }
  })

  it('reports an unreachable server', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = await request('/items/').catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.message).toBe('The server cannot be reached. Is the backend running?')
    expect(error.status).toBe(0)
  })

  it('ignores an unparsable JSON error body', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      headers: { get: () => 'application/json' },
      json: async () => {
        throw new Error('bad json')
      },
    })
    const error = await request('/items/').catch((e) => e)
    expect(error.message).toBe('An error occurred on the server.')
  })
})
