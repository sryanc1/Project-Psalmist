import '../css/admin.css'
import { requireAuth, signOutUser, onAuthChange } from './auth.js'
import { getSongs, addSong, updateSong, deleteSong, rebuildIndex } from './songs.js'
import { parseChorusFile, batchImport } from './import.js'

// - Auth guard -
requireAuth()

// - Show admin email -
onAuthChange((user) => {
  const emailEl = document.getElementById('admin-email')
  if (emailEl && user) emailEl.textContent = user.email
})

// - Sign out -
document.getElementById('signout-btn')
  .addEventListener('click', async () => {
    await signOutUser()
    window.location.href = import.meta.env.BASE_URL
  })

// - Rebuild index -
document.getElementById('rebuild-index-btn')
  .addEventListener('click', async () => {
    if (!confirm(
      'Rebuild both indexes from scratch? ' +
      'This may take a moment with large collections.'))
      return

    const btn = document.getElementById('rebuild-index-btn')
    btn.disabled = true
    btn.textContent = 'Rebuilding...'

    try {
      await Promise.all([
        rebuildIndex('hymn'),
        rebuildIndex('chorus')
      ])
      alert('Index rebuilt successfully.')
    } catch (err) {
      console.error('Rebuild failed:', err)
      alert('Rebuild failed. Check the console for details.')
    } finally {
      btn.disabled = false
      btn.textContent = 'Rebuild Index'
    }
  })

// - State -
let allSongs = []
let editingId = null  // null = adding, string = editing
let stanzas = []    // working stanza list in modal
let verseCount = 0

// - Elements -
const songListEl = document.getElementById('song-list')
const modalOverlay = document.getElementById('modal-overlay')
const modalTitle = document.getElementById('modal-title')
const modalSaveBtn = document.getElementById('modal-save')
const stanzaListEl = document.getElementById('stanza-list')
const formError = document.getElementById('form-error')
const typeBtns = document.querySelectorAll('.type-btn')

// - Load songs -
async function loadSongs() {
  try {
    const { hymns, choruses } = await getSongs()
    allSongs = [...hymns, ...choruses]
    renderSongList(allSongs)
  } catch (err) {
    console.error('Failed to load songs:', err)
    songListEl.innerHTML =
      `<div class="state-message">Failed to load songs.</div>`
  }
}

// - Render song list -
function renderSongList(songs, newId = null) {
  if (songs.length === 0) {
    songListEl.innerHTML =
      `<div class="state-message">No songs yet. Add one!</div>`
    return
  }

  songListEl.innerHTML = songs
    .map(song => `
      <div class="admin-song-row ${song.id === newId ? 'new' : ''}"
          data-id="${song.id}">
        <span class="type-pill pill-${song.type}">${song.type}</span>
        <span class="song-number-badge">${song.number}</span>
        <span class="admin-song-title">${song.title}</span>
        <div class="admin-song-actions">
          <button class="icon-btn edit-btn" data-id="${song.id}">Edit</button>
          <button class="icon-btn danger delete-btn" data-id="${song.id}">Delete</button>
        </div>
      </div>`)
    .join('')

  // Remove highlight after animation
  if (newId) {
    setTimeout(() => {
      const row = songListEl.querySelector(`[data-id="${newId}"]`)
      if (row) row.classList.remove('new')
    }, 2500)
  }

  // Attach row button listeners
  songListEl.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditModal(btn.dataset.id))
  })
  songListEl.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => handleDelete(btn.dataset.id))
  })
}

// - Modal open - Add -
document.getElementById('add-song-btn')
  .addEventListener('click', () => openModal())

function openModal(song = null) {
  editingId = song ? song.id : null
  stanzas = song ? [...song.lyrics] : []
  verseCount = stanzas.filter(s => s.type === 'verse').length

  modalTitle.textContent = song ? 'Edit Song' : 'Add New Song'

  // Populate meta fields
  document.getElementById('field-number').value = song?.number || ''
  document.getElementById('field-title').value = song?.title  || ''
  document.getElementById('field-author').value = song?.author || ''
  document.getElementById('field-key').value = song?.key    || ''
  document.getElementById('field-tags').value =
  song?.tags ? song.tags.join(', ') : ''

  // Set type toggle
  const type = song?.type || 'chorus'
  typeBtns.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type)
  })

  formError.style.display = 'none'
  renderStanzas()
  modalOverlay.style.display = 'flex'
  document.getElementById('field-title').focus()
}

// - Modal open - Edit -
function openEditModal(id) {
  const song = allSongs.find(s => s.id === id)
  if (song) openModal(song)
}

// - Modal close -
function closeModal() {
  modalOverlay.style.display = 'none'
  editingId = null
  stanzas = []
  verseCount = 0
}

document.getElementById('modal-close')
  .addEventListener('click', closeModal)
document.getElementById('modal-cancel')
  .addEventListener('click', closeModal)

// Close on overlay click
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeModal()
})

// - Type toggle -
typeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    typeBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// - Stanza rendering -
function renderStanzas() {
  stanzaListEl.innerHTML = ''
  stanzas.forEach((stanza, index) => {
    const block = document.createElement('div')
    block.className =
      `stanza-block ${stanza.type !== 'verse' ? stanza.type : ''}`
    block.innerHTML = `
      <div class="stanza-header">
        <span class="stanza-badge badge-${stanza.type}">
          ${stanza.label}
        </span>
        <button class="stanza-delete" data-index="${index}">✕</button>
      </div>
      <textarea
        data-index="${index}"
        placeholder="Enter lyrics, one line per line..."
      >${stanza.lines ? stanza.lines.join('\n') : ''}</textarea>`
    stanzaListEl.appendChild(block)
  })

  // Textarea change listeners
  stanzaListEl.querySelectorAll('textarea').forEach(ta => {
    ta.addEventListener('input', (e) => {
      stanzas[e.target.dataset.index].lines =
        e.target.value.split('\n')
    })
  })

  // Delete stanza listeners
  stanzaListEl.querySelectorAll('.stanza-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.target.dataset.index)
      stanzas.splice(index, 1)
      recalculateVerseLabels()
      renderStanzas()
    })
  })
}

// - Add stanza buttons -
document.querySelectorAll('.add-stanza-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const stype = btn.dataset.stype
    if (stype === 'verse') {
      verseCount++
      stanzas.push({
        type: 'verse',
        label: `Verse ${verseCount}`,
        lines: []
      })
    } else if (stype === 'refrain') {
      stanzas.push({ type: 'refrain', label: 'Refrain', lines: [] })
    } else if (stype === 'refrain-alt') {
      const altCount = stanzas
        .filter(s => s.type === 'refrain-alt').length + 1
      stanzas.push({
        type: 'refrain-alt',
        label: `Refrain ${altCount + 1}`,
        lines: []
      })
    }
    renderStanzas()

    // Scroll to new stanza
    stanzaListEl.lastElementChild?.scrollIntoView({ behavior: 'smooth' })
  })
})

// - Recalculate verse labels after delete -
function recalculateVerseLabels() {
  let count = 0
  stanzas.forEach(s => {
    if (s.type === 'verse') {
      count++
      s.label = `Verse ${count}`
    }
  })
  verseCount = count
}

// - Save -
modalSaveBtn.addEventListener('click', async () => {
  const number = parseInt(document.getElementById('field-number').value) || 0
  const title = document.getElementById('field-title').value.trim()
  const author = document.getElementById('field-author').value.trim()
  const key = document.getElementById('field-key').value
  const tags = document.getElementById('field-tags').value
    .split(',').map(t => t.trim()).filter(Boolean)
  const type = document.querySelector('.type-btn.active').dataset.type

  // - Validation -
  if (!title || !number || stanzas.length === 0) {
    formError.textContent = 'Please add a number, title and at least one stanza.'
    formError.style.display = 'block'
    return
  }

  // Duplicate number check - within same type only
  const numberExists = allSongs.some(s =>
    s.type === type &&
    s.number === number &&
    s.id !== editingId  // allow same number when editing the same song
  )
  if (numberExists) {
    formError.textContent =
      `${type === 'hymn' ? 'Hymn' : 'Chorus'} number ${number} already exists. Please use a different number.`
    formError.style.display = 'block'
    return
  }

  // Duplicate title check - warn but allow
  const titleExists = allSongs.some(s =>
    s.title.toLowerCase() === title.toLowerCase() &&
    s.id !== editingId
  )
  if (titleExists) {
    const proceed = confirm(
      `A song named "${title}" already exists. Are you sure you want to save a duplicate?`
    )
    if (!proceed) return
  }
  formError.style.display = 'none'

  // Clean stanzas - filter empty lines
  const cleanStanzas = stanzas.map(s => ({
    ...s,
    lines: s.lines.filter(l => l.trim() !== '')
  }))

  const songData = {
    number, title, author, key, tags, type,
    lyrics: cleanStanzas,
    hasMusicXml: false
  }

  modalSaveBtn.disabled = true
  modalSaveBtn.textContent = 'Saving...'

  try {
    if (editingId) {
      const oldSong = allSongs.find(s => s.id === editingId)
      await updateSong(editingId, songData, oldSong.type)
      const index = allSongs.findIndex(s => s.id === editingId)
      allSongs[index] = { id: editingId, ...songData }
      allSongs.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type)
        return a.number - b.number
      })
      closeModal()
      renderSongList(allSongs, editingId)
    } else {
      const newId = await addSong(songData)
      const newSong = { id: newId, ...songData }
      allSongs.push(newSong)
      allSongs.sort((a, b) => {
        if (a.type !== b.type) return a.type.localeCompare(b.type)
        return a.number - b.number
      })
      closeModal()
      renderSongList(allSongs, newId)
    }
  } catch (err) {
    console.error('Save failed:', err)
    formError.textContent = 'Save failed. Please try again.'
    formError.style.display = 'block'
  } finally {
    modalSaveBtn.disabled = false
    modalSaveBtn.textContent = 'Save Song'
  }
})

// - Delete -
async function handleDelete(id) {
  const song = allSongs.find(s => s.id === id)
  if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return
  try {
    await deleteSong(id, song.type)
    allSongs = allSongs.filter(s => s.id !== id)
    renderSongList(allSongs)
  } catch (err) {
    console.error('Delete failed:', err)
    alert('Delete failed. Please try again.')
  }
}

// - Init -
loadSongs()

// - Bulk import -
const importFile = document.getElementById('import-file')
const importFilename = document.getElementById('import-filename')
const importPreview = document.getElementById('import-preview')
const importProgress = document.getElementById('import-progress')
const progressFill = document.getElementById('progress-fill')
const progressLabel = document.getElementById('progress-label')
const importResult = document.getElementById('import-result')
const importBtn = document.getElementById('import-btn')

let parsedSongs = []

importFile.addEventListener('change', (e) => {
  const file = e.target.files[0]
  if (!file) return

  importFilename.textContent = file.name
  importResult.className = 'import-result'
  importResult.textContent = ''

  const reader = new FileReader()
  reader.onload = (ev) => {
    parsedSongs = parseChorusFile(ev.target.result)
    renderImportPreview(parsedSongs)
    importBtn.disabled = parsedSongs.length === 0
  }
  reader.readAsText(file)
})

function renderImportPreview(songs) {
  if (!songs.length) {
    importPreview.innerHTML =
      `<div class="preview-summary">No songs found in file.</div>`
    importPreview.classList.add('visible')
    return
  }

  importPreview.innerHTML = `
    <div class="preview-summary">
      Found ${songs.length} songs - review before importing:
    </div>
    <div class="preview-list">
      ${songs.map(s => `
        <div class="preview-row">
          <span class="preview-num">${s.number}</span>
          <span class="preview-title">${s.title}</span>
          <span class="preview-stanzas">
            ${s.lyrics.length} stanza${s.lyrics.length !== 1 ? 's' : ''}
          </span>
        </div>`).join('')}
    </div>`
  importPreview.classList.add('visible')
}

importBtn.addEventListener('click', async () => {
  if (!parsedSongs.length) return

  if (!confirm(
    `Import ${parsedSongs.length} choruses into Firestore? ` +
    `Duplicates will be skipped automatically.`)) return

  console.log('parsed songs sample:', parsedSongs.slice(0, 3))
  importBtn.disabled = true
  importProgress.classList.add('visible')
  importResult.className = 'import-result'

  try {
    const { imported, skipped, skippedSongs } =
      await batchImport(parsedSongs, 'chorus', (written, total) => {
        const pct = Math.round((written / total) * 100)
        progressFill.style.width = `${pct}%`
        progressLabel.textContent = `${pct}%`
      })

    progressFill.style.width = '100%'
    progressLabel.textContent = '100%'

    // Build result message
    let message = `Successfully imported ${imported} song${imported !== 1 ? 's' : ''}.`
    if (skipped > 0) {
      message += ` ${skipped} duplicate${skipped !== 1 ? 's' : ''} skipped:`
      const skipList = skippedSongs
        .map(s => `  #${s.number} "${s.title}" - ${s.reason}`)
        .join('\n')
      message += `\n${skipList}`
    }

    importResult.style.whiteSpace = 'pre-wrap'
    importResult.textContent = message
    importResult.classList.add('visible', 'success')

    await loadSongs()

  } catch (err) {
    console.error('Import failed:', err)
    importResult.textContent =
      `Import failed: ${err.message}. Check the console for details.`
    importResult.classList.add('visible', 'error')
  } finally {
    importBtn.disabled = false
    importProgress.classList.remove('visible')
    parsedSongs = []
    importFile.value = ''
    importFilename.textContent = 'No file chosen'
    importPreview.classList.remove('visible')
  }
})