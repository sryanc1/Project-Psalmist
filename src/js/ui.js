import { auth } from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongs } from './songs.js'

// ── Admin nav visibility ──
onAuthStateChanged(auth, (user) => {
  const adminNav = document.getElementById('admin-nav')
  if (!adminNav) return
  adminNav.style.display = user ? 'block' : 'none'
})

// ── Song list ──
const songListEl = document.getElementById('song-list')
const searchInput = document.getElementById('search-input')

let allSongs = []

async function init() {
  try {
    allSongs = await getSongs()
    renderSongList(allSongs)
  } catch (err) {
    console.error('Failed to load songs:', err)
    songListEl.innerHTML = `
      <div class="state-message">
        Unable to load songs. Please try again later.
      </div>`
  }
}

function renderSongList(songs) {
  if (!songListEl) return

  if (songs.length === 0) {
    songListEl.innerHTML = `
      <div class="state-message">No songs found.</div>`
    return
  }

  songListEl.innerHTML = songs
    .map((song, index) => `
      <a class="song-row" href="/pages/song.html?id=${song.id}">
        <span class="song-number">${index + 1}</span>
        <span class="song-title">${song.title}</span>
        ${song.key
          ? `<span class="song-key">${song.key}</span>`
          : ''}
      </a>`)
    .join('')
}

// ── Search / filter ──
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const query = searchInput.value.toLowerCase().trim()
    if (!query) {
      renderSongList(allSongs)
      return
    }
    const filtered = allSongs.filter(song =>
      song.title.toLowerCase().includes(query) ||
      (song.author && song.author.toLowerCase().includes(query)) ||
      (song.tags && song.tags.some(tag =>
        tag.toLowerCase().includes(query)))
    )
    renderSongList(filtered)
  })
}

init()