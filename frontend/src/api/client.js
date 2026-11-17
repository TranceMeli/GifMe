/** Error thrown for every failed API call. `message` is always safe to show to the user. */
export class ApiError extends Error {
  constructor(message, { status = 0, code = 'error', data = null } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.data = data
  }
}

const FALLBACK_MESSAGES = {
  404: 'The item was not found.',
  413: 'The file is too large.',
}

async function parseBody(response) {
  const type = response.headers.get('Content-Type') || ''
  if (!type.includes('application/json')) return null
  try {
    return await response.json()
  } catch {
    return null
  }
}

export async function request(path, { method = 'GET', params, json, body, blob = false } = {}) {
  let url = `/api${path}`
  if (params) {
    const query = new URLSearchParams()
    for (const [key, value] of Object.entries(params)) {
      for (const v of Array.isArray(value) ? value : [value]) {
        if (v !== undefined && v !== null && v !== '') query.append(key, v)
      }
    }
    const qs = query.toString()
    if (qs) url += `?${qs}`
  }

  const init = { method, headers: { Accept: 'application/json' } }
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json'
    init.body = JSON.stringify(json)
  } else if (body) {
    init.body = body // FormData sets its own multipart boundary
  }

  let response
  try {
    response = await fetch(url, init)
  } catch {
    throw new ApiError('The server cannot be reached. Is the backend running?')
  }

  if (blob && response.ok) return response.blob()

  const data = await parseBody(response)
  if (!response.ok) {
    const message =
      (data && typeof data.detail === 'string' && data.detail) ||
      (data && firstFieldError(data)) ||
      FALLBACK_MESSAGES[response.status] ||
      (response.status >= 500
        ? 'An error occurred on the server.'
        : 'The request was not valid.')
    throw new ApiError(message, { status: response.status, code: data?.code, data })
  }
  return data
}

function firstFieldError(data) {
  for (const value of Object.values(data)) {
    const first = Array.isArray(value) ? value[0] : value
    if (typeof first === 'string') return first
  }
  return null
}
