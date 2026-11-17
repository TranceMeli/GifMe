export const TYPE_LABELS = { gif: 'GIF', meme: 'Meme', video: 'Video' }

export function formatSize(bytes) {
  if (bytes == null) return '–'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB']
  let value = bytes / 1024
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i += 1
  }
  return `${value.toLocaleString('en-GB', { maximumFractionDigits: 1, minimumFractionDigits: value < 10 ? 1 : 0 })} ${units[i]}`
}

export function formatDimensions(item) {
  return item.width && item.height ? `${item.width} × ${item.height} px` : 'Unknown'
}

export function formatDate(iso) {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

/** Absolute URL for a server-relative path such as /media/items/ab/x.gif. */
export function absoluteUrl(path) {
  return new URL(path, window.location.origin).href
}
