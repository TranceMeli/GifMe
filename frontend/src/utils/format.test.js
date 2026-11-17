import { describe, expect, it } from 'vitest'
import { absoluteUrl, formatDate, formatDimensions, formatSize, TYPE_LABELS } from './format'

describe('formatSize', () => {
  it('shows bytes below one kilobyte', () => {
    expect(formatSize(0)).toBe('0 B')
    expect(formatSize(1023)).toBe('1023 B')
  })

  it('uses one decimal below ten and none above', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
    expect(formatSize(1536)).toBe('1.5 KB')
    expect(formatSize(150 * 1024)).toBe('150 KB')
    expect(formatSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatSize(1.5 * 1024 * 1024 * 1024)).toBe('1.5 GB')
  })

  it('shows a dash for a missing size', () => {
    expect(formatSize(null)).toBe('–')
    expect(formatSize(undefined)).toBe('–')
  })
})

describe('formatDimensions', () => {
  it('joins width and height', () => {
    expect(formatDimensions({ width: 480, height: 270 })).toBe('480 × 270 px')
  })

  it('is "Unknown" when either side is missing', () => {
    expect(formatDimensions({ width: null, height: null })).toBe('Unknown')
    expect(formatDimensions({ width: 100, height: null })).toBe('Unknown')
  })
})

describe('formatDate', () => {
  it('uses day/month/year with two digits', () => {
    expect(formatDate(new Date(2026, 10, 7, 12).toISOString())).toBe('07/11/2026')
    expect(formatDate(new Date(2026, 0, 31, 12).toISOString())).toBe('31/01/2026')
  })
})

describe('absoluteUrl', () => {
  it('prefixes server-relative paths with the page origin', () => {
    expect(absoluteUrl('/media/items/ab/x.gif')).toBe(`${window.location.origin}/media/items/ab/x.gif`)
  })
})

describe('TYPE_LABELS', () => {
  it('has an English label for every type', () => {
    expect(TYPE_LABELS).toEqual({ gif: 'GIF', meme: 'Meme', video: 'Video' })
  })
})
