import { db } from './firebase.js'
import { rebuildIndex } from './songs.js'
import {
  collection,
  writeBatch,
  doc,
  serverTimestamp
} from 'firebase/firestore'

const SONGS_COLLECTION = 'songs'
const BATCH_SIZE = 400

// - Parse text file into song objects -
export function parseChorusFile(text) {
  const songs = []
  let current = null

  // Normalise line endings and split into blocks
  const blocks = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split(/\n\s*\n/)
    .map(b => b.trim())
    .filter(b => b.length > 0)

  for (const block of blocks) {
    const lines = block.split('\n').map(l => l.trim()).filter(l => l)
    if (!lines.length) continue

    const firstLine = lines[0]

    // - New song - bare integer -
    if (/^\d+$/.test(firstLine)) {
      if (current) songs.push(finaliseSong(current))
      current = {
        number: parseInt(firstLine),
        type:   'chorus',
        lyrics: []
      }
      // If there are more lines in the same block
      // they are the first verse
      if (lines.length > 1) {
        const verseLines = lines.slice(1)
        current.lyrics.push({
          type:  'verse',
          label: 'Verse 1',
          lines: verseLines
        })
      }
      continue
    }

    if (!current) continue

    // - Alt Chorus -
    if (/^Alt Chorus:/i.test(firstLine)) {
      const remainder = firstLine.replace(/^Alt Chorus:\s*/i, '').trim()
      const lyricLines = [
        ...(remainder ? [remainder] : []),
        ...lines.slice(1)
      ]
      current.lyrics.push({
        type:  'refrain-alt',
        label: 'Alt Chorus',
        lines: lyricLines
      })
      continue
    }

    // - Chorus -
    if (/^Chorus:/i.test(firstLine)) {
      const remainder = firstLine.replace(/^Chorus:\s*/i, '').trim()
      const lyricLines = [
        ...(remainder ? [remainder] : []),
        ...lines.slice(1)
      ]
      current.lyrics.push({
        type:  'refrain',
        label: 'Chorus',
        lines: lyricLines
      })
      continue
    }

    // - Regular verse -
    const verseCount = current.lyrics
      .filter(s => s.type === 'verse').length
    current.lyrics.push({
      type:  'verse',
      label: `Verse ${verseCount + 1}`,
      lines: lines
    })
  }

  // Push the last song
  if (current) songs.push(finaliseSong(current))

  return songs
}

// - Finalise song - fill in defaults -
function finaliseSong(song) {
  // Derive title from first lyric line of first stanza
  const firstStanza = song.lyrics.find(s => s.type === 'verse')
  const title = firstStanza?.lines?.[0] || `Song ${song.number}`

  return {
    number: song.number,
    type: 'chorus',
    title: toTitleCase(title),
    author: '',
    key:'',
    tags: [],
    lyrics: song.lyrics,
    hasMusicXml: false
  }
}

// - Basic title case for first line -
function toTitleCase(str) {
  const minorWords =
    ['a','an','the','and','but','or','for','nor',
     'on','at','to','by','in','of','is','it']
  return str
    .toLowerCase()
    .split(' ')
    .map((word, i) => {
      const clean = word.replace(/[^a-z']/g, '')
      if (i === 0 || !minorWords.includes(clean)) {
        return word.charAt(0).toUpperCase() + word.slice(1)
      }
      return word
    })
    .join(' ')
}

//  - Deduplicate against existing songs  -
async function deduplicateSongs(songs, type) {
  const existing = await getSongIndex(type)

  const existingNumbers = new Set(existing.map(s => s.number))
  const existingTitles  = new Set(
    existing.map(s => s.title.toLowerCase().trim())
  )

  const unique = []
  const skipped = []

  songs.forEach(song => {
    const titleKey = song.title.toLowerCase().trim()
    if (existingNumbers.has(song.number)) {
      skipped.push({ ...song, reason: `Number ${song.number} already exists` })
    } else if (existingTitles.has(titleKey)) {
      skipped.push({ ...song, reason: `Title "${song.title}" already exists` })
    } else {
      unique.push(song)
      // Add to sets so duplicates within the import file are also caught
      existingNumbers.add(song.number)
      existingTitles.add(titleKey)
    }
  })

  return { unique, skipped }
}

// ── Batch write songs to Firestore ──
export async function batchImport(songs, type = 'chorus', onProgress) {
  const { unique, skipped } = await deduplicateSongs(songs, type)

  if (unique.length === 0) {
    return { imported: 0, skipped: skipped.length, skippedSongs: skipped }
  }

  let written = 0

  for (let i = 0; i < unique.length; i += BATCH_SIZE) {
    const chunk = unique.slice(i, i + BATCH_SIZE)
    const batch = writeBatch(db)

    chunk.forEach(song => {
      const ref = doc(collection(db, SONGS_COLLECTION))
      batch.set(ref, {
        ...song,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      })
    })

    await batch.commit()
    written += chunk.length
    if (onProgress) onProgress(written, unique.length)
  }

  await rebuildIndex(type)

  return {
    imported: unique.length,
    skipped: skipped.length,
    skippedSongs: skipped
  }
}