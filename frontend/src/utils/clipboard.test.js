import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canCopyImage, copyItem, copyLink } from './clipboard'

const gif = { type: 'gif', file_url: '/media/items/aa/1.gif' }
const video = { type: 'video', file_url: '/media/items/aa/1.mp4' }
const meme = { type: 'meme', file_url: '/media/items/aa/1.png' }
const absolute = (path) => `${window.location.origin}${path}`

function setClipboard(value) {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

describe('clipboard helpers', () => {
  let writeText

  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue()
    setClipboard({ writeText })
    delete window.ClipboardItem
  })

  afterEach(() => {
    vi.restoreAllMocks()
    delete window.ClipboardItem
  })

  it('copyLink copies the absolute file URL and says so', async () => {
    const message = await copyLink(gif)
    expect(writeText).toHaveBeenCalledWith(absolute(gif.file_url))
    expect(message).toMatch(/File link copied/)
    expect(message).toMatch(/only works on this computer/)
  })

  it('gifs and videos are always copied as a link', async () => {
    expect(await copyItem(gif)).toMatch(/^GIF link copied/)
    expect(await copyItem(video)).toMatch(/^Video link copied/)
    expect(writeText).toHaveBeenNthCalledWith(1, absolute(gif.file_url))
    expect(writeText).toHaveBeenNthCalledWith(2, absolute(video.file_url))
  })

  it('falls back to the link for a meme when images cannot be copied', async () => {
    expect(canCopyImage()).toBe(false)
    const message = await copyItem(meme)
    expect(writeText).toHaveBeenCalledWith(absolute(meme.file_url))
    expect(message).toMatch(/could not be copied, so the file link was copied instead/)
  })

  it('copies a meme as PNG when the browser supports it', async () => {
    const write = vi.fn().mockResolvedValue()
    setClipboard({ writeText, write })
    window.ClipboardItem = class {
      constructor(items) {
        this.items = items
        // A browser awaits these promises; the test only checks that a PNG was offered.
        Object.values(items).forEach((value) => Promise.resolve(value).catch(() => {}))
      }
    }
    window.createImageBitmap = vi.fn()
    expect(canCopyImage()).toBe(true)
    const message = await copyItem(meme)
    expect(write).toHaveBeenCalledTimes(1)
    expect(Object.keys(write.mock.calls[0][0][0].items)).toEqual(['image/png'])
    expect(message).toBe('Image copied to the clipboard as PNG.')
    expect(writeText).not.toHaveBeenCalled()
    delete window.createImageBitmap
  })

  it('falls back to the link when the browser refuses the image', async () => {
    const write = vi.fn().mockRejectedValue(new Error('denied'))
    setClipboard({ writeText, write })
    window.ClipboardItem = class {
      constructor(items) {
        Object.values(items).forEach((value) => Promise.resolve(value).catch(() => {}))
      }
    }
    window.createImageBitmap = vi.fn()
    const message = await copyItem(meme)
    expect(writeText).toHaveBeenCalledWith(absolute(meme.file_url))
    expect(message).toMatch(/file link was copied instead/)
    delete window.createImageBitmap
  })

  it('uses the legacy copy command when the clipboard API rejects', async () => {
    writeText.mockRejectedValue(new Error('no permission'))
    document.execCommand = vi.fn().mockReturnValue(true)
    await expect(copyLink(gif)).resolves.toMatch(/File link copied/)
    expect(document.execCommand).toHaveBeenCalledWith('copy')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('throws when every way of copying fails', async () => {
    writeText.mockRejectedValue(new Error('no permission'))
    document.execCommand = vi.fn().mockReturnValue(false)
    await expect(copyLink(gif)).rejects.toThrow('copy failed')
    expect(document.querySelector('textarea')).toBeNull()
  })
})
