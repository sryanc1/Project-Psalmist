import { requireAuth, signOutUser, onAuthChange } from './auth.js'
import { getSongs, addSong, updateSong, deleteSong } from './songs.js'

// ── Auth guard ──
requireAuth()

// ── Show admin email ──
onAuthChange((user) => {
  const emailEl = document.getElementById('admin-email')
  if (emailEl && user) emailEl.textContent = user.email
})

// ── Sign out ──
document.getElementById('signout-btn')
  .addEventListener('click', async () => {
    await signOutUser()
    window.location.href = `${import.meta.env.BASE_URL}pages/login.html`
  })

// ── State ──
let allSongs    = []
let editingId   = null  // null = adding, string = editing
let stanzas     = []    // working stanza list in modal
let verseCount  = 0

// ── Elements ──
const songListEl     = document.getElementById('song-list')
const modalOverlay   = document.getElementById('modal-overlay')
const modalTitle     = document.getElementById('modal-title')
const modalSaveBtn   = document.getElementById('modal-save')
const stanzaListEl   = document.getElementById('stanza-list')
const formError      = document.getElementById('form-error')
const typeBtns       = document.querySelectorAll('.type-btn')

// ── Load songs ──
async function loadSongs() {
  try {
    allSongs = await getSongs()
    renderSongList(allSongs)
  } catch (err) {
    console.error('Failed to load songs:', err)
    songListEl.innerHTML =
      `<div class="state-message">Failed to load songs.</div>`
  }
}

// ── Render song list ──
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

// ── Modal open — Add ──
document.getElementById('add-song-btn')
  .addEventListener('click', () => openModal())

function openModal(song = null) {
  editingId  = song ? song.id : null
  stanzas    = song ? [...song.lyrics] : []
  verseCount = stanzas.filter(s => s.type === 'verse').length

  modalTitle.textContent = song ? 'Edit Song' : 'Add New Song'

  // Populate meta fields
  document.getElementById('field-title').value  = song?.title  || ''
  document.getElementById('field-author').value = song?.author || ''
  document.getElementById('field-key').value    = song?.key    || ''
  document.getElementById('field-tags').value   =
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

// ── Modal open — Edit ──
function openEditModal(id) {
  const song = allSongs.find(s => s.id === id)
  if (song) openModal(song)
}

// ── Modal close ──
function closeModal() {
  modalOverlay.style.display = 'none'
  editingId  = null
  stanzas    = []
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

// ── Type toggle ──
typeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    typeBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
  })
})

// ── Stanza rendering ──
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

// ── Add stanza buttons ──
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

// ── Recalculate verse labels after delete ──
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

// ── Save ──
modalSaveBtn.addEventListener('click', async () => {
  const title  = document.getElementById('field-title').value.trim()
  const author = document.getElementById('field-author').value.trim()
  const key    = document.getElementById('field-key').value
  const tags   = document.getElementById('field-tags').value
    .split(',').map(t => t.trim()).filter(Boolean)
  const type   = document.querySelector('.type-btn.active').dataset.type

  // Validation
  if (!title || stanzas.length === 0) {
    formError.style.display = 'block'
    return
  }
  formError.style.display = 'none'

  // Clean stanzas — filter empty lines
  const cleanStanzas = stanzas.map(s => ({
    ...s,
    lines: s.lines.filter(l => l.trim() !== '')
  }))

  const songData = {
    title, author, key, tags, type,
    lyrics: cleanStanzas,
    hasMusicXml: false
  }

  modalSaveBtn.disabled = true
  modalSaveBtn.textContent = 'Saving...'

  try {
    if (editingId) {
      await updateSong(editingId, songData)
      // Update in local array
      const index = allSongs.findIndex(s => s.id === editingId)
      allSongs[index] = { id: editingId, ...songData }
      allSongs.sort((a, b) => a.title.localeCompare(b.title))
      closeModal()
      renderSongList(allSongs, editingId)
    } else {
      const newId = await addSong(songData)
      const newSong = { id: newId, ...songData }
      allSongs.unshift(newSong)  // add to top of local array
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

// ── Delete ──
async function handleDelete(id) {
  const song = allSongs.find(s => s.id === id)
  if (!confirm(`Delete "${song.title}"? This cannot be undone.`)) return

  try {
    await deleteSong(id)
    allSongs = allSongs.filter(s => s.id !== id)
    renderSongList(allSongs)
  } catch (err) {
    console.error('Delete failed:', err)
    alert('Delete failed. Please try again.')
  }
}

// ── Init ──
loadSongs()