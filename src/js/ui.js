import { auth }         from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongIndex } from './songs.js'

// ── Admin nav ──
onAuthStateChanged(auth, (user) => {
  const adminNav = document.getElementById('admin-nav')
  if (!adminNav) return
  adminNav.style.display = user ? 'block' : 'none'
})

// ── Elements ──
const songListEl  = document.getElementById('song-list')
const searchInput = document.getElementById('search-input')
const tabBtns     = document.querySelectorAll('.tab-btn')

// ── State ──
let activeTab     = 'choruses'
let hymnIndex     = null
let chorusIndex   = null

// ── Tab switching ──
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'))
    btn.classList.add('active')
    activeTab = btn.dataset.tab
    if (searchInput) searchInput.value = ''
    loadTab(activeTab)
  })
})

// ── Load tab ──
async function loadTab(tab) {
  // Use cache if available
  if (tab === 'choruses' && chorusIndex) {
    renderList(chorusIndex)
    return
  }
  if (tab === 'hymns' && hymnIndex) {
    renderList(hymnIndex)
    return
  }

  songListEl.innerHTML =
    `<div class="state-message">Loading...</div>`

  try {
    const type  = tab === 'hymns' ? 'hymn' : 'chorus'
    const songs = await getSongIndex(type)

    // Cache it
    if (tab === 'hymns')    hymnIndex   = songs
    if (tab === 'choruses') chorusIndex = songs

    renderList(songs)
  } catch (err) {
    console.error('Failed to load index:', err)
    songListEl.innerHTML =
      `<div class="state-message">Unable to load songs. Please try again.</div>`
  }
}

// ── Render list ──
function renderList(songs) {
  if (!songs || songs.length === 0) {
    songListEl.innerHTML =
      `<div class="state-message">No songs found.</div>`
    return
  }

  songListEl.innerHTML = `
    <div class="song-section-list card">
      ${songs.map(song => `
        <a class="song-row"
           href="${import.meta.env.BASE_URL}pages/song.html?id=${song.id}">
          <span class="song-number">${song.number}</span>
          <span class="song-title">${song.title}</span>
          ${song.key
            ? `<span class="song-key">${song.key}</span>`
            : ''}
        </a>`).join('')}
    </div>`
}

// ── Search ──
if (searchInput) {
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim()

    // Search across both indexes if loaded, otherwise just active tab
    const hymnResults   = hymnIndex
      ? hymnIndex.filter(s => matches(s, q))
      : []
    const chorusResults = chorusIndex
      ? chorusIndex.filter(s => matches(s, q))
      : []

    if (!q) {
      loadTab(activeTab)
      return
    }

    // Show results from both in sections
    let html = ''
    if (hymnResults.length > 0) {
      html += sectionHtml('Hymns', hymnResults)
    }
    if (chorusResults.length > 0) {
      html += sectionHtml('Choruses', chorusResults)
    }
    if (!html) {
      html = `<div class="state-message">No songs match your search.</div>`
    }
    songListEl.innerHTML = html
  })
}

function matches(song, q) {
  if (!q) return true
  return (
    song.title.toLowerCase().includes(q) ||
    song.number.toString() === q
  )
}

function sectionHtml(label, songs) {
  return `
    <div class="song-section">
      <div class="song-section-header">${label}</div>
      <div class="song-section-list card">
        ${songs.map(song => `
          <a class="song-row"
             href="${import.meta.env.BASE_URL}pages/song.html?id=${song.id}">
            <span class="song-number">${song.number}</span>
            <span class="song-title">${song.title}</span>
            ${song.key
              ? `<span class="song-key">${song.key}</span>`
              : ''}
          </a>`).join('')}
      </div>
    </div>`
}

// ── Init — load choruses by default ──
loadTab('choruses')