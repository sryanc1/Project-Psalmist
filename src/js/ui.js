import { auth } from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongs } from './songs.js'

// ── Admin nav visibility ──
onAuthStateChanged(auth, (user) => {
  const adminNav = document.getElementById('admin-nav')
  if (!adminNav) return
  adminNav.style.display = user ? 'block' : 'none'
})

// ── Elements ──
const songListEl  = document.getElementById('song-list')
const searchInput = document.getElementById('search-input')

let allHymns    = []
let allChoruses = []

// ── Init ──
async function init() {
  try {
    const { hymns, choruses } = await getSongs()
    allHymns    = hymns
    allChoruses = choruses
    renderSongList(allHymns, allChoruses)
  } catch (err) {
    console.error('Failed to load songs:', err)
    songListEl.innerHTML = `
      <div class="state-message">
        Unable to load songs. Please try again later.
      </div>`
  }
}

// ── Render ──
function renderSongList(hymns, choruses) {
  if (!songListEl) return

  const hasHymns    = hymns.length > 0
  const hasChoruses = choruses.length > 0

  if (!hasHymns && !hasChoruses) {
    songListEl.innerHTML =
      `<div class="state-message">No songs found.</div>`
    return
  }

  let html = ''

  if (hasHymns) {
    html += `
      <div class="song-section">
        <div class="song-section-header">Hymns</div>
        <div class="song-section-list">
          ${hymns.map(song => songRowHtml(song)).join('')}
        </div>
      </div>`
  }

  if (hasChoruses) {
    html += `
      <div class="song-section">
        <div class="song-section-header">Choruses</div>
        <div class="song-section-list">
          ${choruses.map(song => songRowHtml(song)).join('')}
        </div>
      </div>`
  }

  songListEl.innerHTML = html
}

function songRowHtml(song) {
  return `
    <a class="song-row" href="${import.meta.env.BASE_URL}pages/song.html?id=${song.id}">
      <span class="song-number">${song.number}</span>
      <span class="song-title">${song.title}</span>
      ${song.key
        ? `<span class="song-key">${song.key}</span>`
        : ''}
    </a>`
}

// ── Search ──
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim()
    if (!query) {
      renderSongList(allHymns, allChoruses)
      return
    }
    const filtered = (songs) => songs.filter(song =>
      song.title.toLowerCase().includes(query) ||
      (song.author && song.author.toLowerCase().includes(query)) ||
      (song.tags && song.tags.some(t => t.toLowerCase().includes(query))) ||
      (song.number && song.number.toString() === query)
    )
    renderSongList(filtered(allHymns), filtered(allChoruses))
  })
}

init()