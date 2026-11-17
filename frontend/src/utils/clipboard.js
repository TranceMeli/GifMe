import { absoluteUrl } from './format'

async function writeText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    } catch {
      // Permission or focus problem: try the legacy path below.
    }
  }
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const ok = document.execCommand('copy')
  area.remove()
  if (!ok) throw new Error('copy failed')
}

/** Re-encode any browser-decodable image as PNG, the only image type all clipboards accept. */
async function toPngBlob(url) {
  const response = await fetch(url)
  if (!response.ok) throw new Error('image fetch failed')
  const bitmap = await createImageBitmap(await response.blob())
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  canvas.getContext('2d').drawImage(bitmap, 0, 0)
  bitmap.close?.()
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('png failed'))), 'image/png'),
  )
}

export function canCopyImage() {
  return Boolean(navigator.clipboard?.write && window.ClipboardItem && window.createImageBitmap)
}

/**
 * Copy a link to the item file. Always works with plain text.
 * @returns {Promise<string>} message that tells the user exactly what was copied
 */
export async function copyLink(item) {
  await writeText(absoluteUrl(item.file_url))
  return 'File link copied. It only works on this computer; download the file to share it.'
}

/**
 * "Copy to clipboard": memes go in as a PNG image where supported. Gifs and videos are
 * always copied as a link, because the clipboard would flatten them to a still frame.
 * @returns {Promise<string>} message that tells the user exactly what was copied
 */
export async function copyItem(item) {
  if (item.type !== 'meme') {
    await writeText(absoluteUrl(item.file_url))
    return item.type === 'gif'
      ? 'GIF link copied (GIFs are always copied as a link). Download the file to share it.'
      : 'Video link copied (videos are always copied as a link). Download the file to share it.'
  }
  if (canCopyImage()) {
    try {
      const png = toPngBlob(item.file_url)
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })])
      return 'Image copied to the clipboard as PNG.'
    } catch {
      // Fall through to the link when the browser refuses the image.
    }
  }
  await writeText(absoluteUrl(item.file_url))
  return 'The image could not be copied, so the file link was copied instead.'
}
