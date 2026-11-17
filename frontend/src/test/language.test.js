import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

// The interface is English. This keeps stray German strings from slipping back in.
const root = join(import.meta.dirname, '..', '..')
const GERMAN_WORDS = [
  'Vorschau', 'Speichern', 'Löschen', 'Bearbeiten', 'Hinzufügen', 'Sammlung', 'Abbrechen', 'Fehler',
  'Datei', 'Dateien', 'Titel', 'Quelle', 'Größe', 'Zurück', 'Suchen', 'Laden', 'Zwischenablage',
  'Favorit', 'Ohne', 'Bitte', 'nicht', 'oder', 'und', 'für', 'wird', 'werden', 'Bild', 'Bilder',
  'Ansicht', 'Drehen', 'Ausschnitt', 'Treffer', 'Eintrag', 'Einträge', 'Mehr',
]
const WORD = new RegExp(`(?<![\\p{L}_])(${GERMAN_WORDS.join('|')})(?![\\p{L}_])`, 'iu')

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'node_modules' || name === 'test' ? [] : sources(path)
    return /\.(vue|js|html)$/.test(name) && !name.endsWith('.test.js') ? [path] : []
  })
}

const files = [...sources(join(root, 'src')), join(root, 'index.html')]

describe('interface language', () => {
  it('finds the source files', () => {
    expect(files.length).toBeGreaterThan(15)
  })

  it('has no umlauts or German quotation marks in the sources', () => {
    const offenders = files.filter((f) => /[äöüÄÖÜß„]/.test(readFileSync(f, 'utf8'))).map((f) => relative(root, f))
    expect(offenders).toEqual([])
  })

  it('contains no common German words', () => {
    const hits = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, index) => {
          const match = WORD.exec(line)
          if (match) hits.push(`${relative(root, file)}:${index + 1} ${match[1]}`)
        })
    }
    expect(hits).toEqual([])
  })

  it('declares the page language as English', () => {
    expect(readFileSync(join(root, 'index.html'), 'utf8')).toMatch(/<html lang="en">/)
  })
})
