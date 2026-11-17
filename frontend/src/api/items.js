import { request } from './client'

export function listItems(params) {
  return request('/items/', { params })
}

/** Items per type for the current search and tags: { gif, meme, video, total }. */
export function getCounts(params) {
  return request('/items/counts/', { params })
}

export function getItem(id) {
  return request(`/items/${id}/`)
}

/** Create from an uploaded File or from a remote URL. */
export function createItem({ file, url, type, title, tags, sourceUrl }) {
  if (file) {
    const form = new FormData()
    form.append('file', file)
    if (type) form.append('type', type)
    if (title) form.append('title', title)
    if (tags) form.append('tags', tags)
    if (sourceUrl) form.append('source_url', sourceUrl)
    return request('/items/', { method: 'POST', body: form })
  }
  return request('/items/', {
    method: 'POST',
    json: { url, type: type || undefined, title, tags: tags ? tags.split(',') : undefined },
  })
}

export function updateItem(id, patch) {
  return request(`/items/${id}/`, { method: 'PATCH', json: patch })
}

export function deleteItem(id) {
  return request(`/items/${id}/`, { method: 'DELETE' })
}

export function listTags() {
  return request('/tags/')
}

export function getEditInfo(id) {
  return request(`/items/${id}/edit-info/`)
}

/** Render an edit without saving; resolves to the resulting image as a Blob. */
export function previewEdit(id, edit) {
  return request(`/items/${id}/edit/preview/`, { method: 'POST', json: edit, blob: true })
}

/** Save an edit as a new item (mode "copy") or over the original (mode "replace"). */
export function saveEdit(id, edit, mode) {
  return request(`/items/${id}/edit/`, { method: 'POST', json: { ...edit, mode } })
}
