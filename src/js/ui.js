import { auth }              from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongIndex, getSong } from './songs.js'

// ── Temporary debug — remove after fix ──
const elements = {
  carouselTrack:  document.getElementById('carousel-track'),
  carouselArea:   document.getElementById('carousel-area'),
  navDotsEl:      document.getElementById('nav-dots'),
  arrowPrev:      document.getElementById('arrow-prev'),
  arrowNext:      document.getElementById('arrow-next'),
  drawerOverlay:  document.getElementById('drawer-overlay'),
  drawerList:     document.getElementById('drawer-list'),
  drawerSearch:   document.getElementById('drawer-search'),
  drawerToggle:   document.getElementById('drawer-toggle'),
  drawerClose:    document.getElementById('drawer-close'),
  drawerBackdrop: document.getElementById('drawer-backdrop'),
}
Object.entries(elements).forEach(([name, el]) => {
  if (!el) console.error(`NULL ELEMENT: ${name}`)
})

// ── Admin nav ──
onAuthStateChanged(auth, (user) => {
  const adminNav = document.getElementById('admin-nav')
  if (adminNav) adminNav.style.display = user ? 'block' : 'none'
})

// ── Elements ──
const carouselTrack  = document.getElementById('carousel-track')
const carouselArea   = document.getElementById('carousel-area')
const navDotsEl      = document.getElementById('nav-dots')
const arrowPrev      = document.getElementById('arrow-prev')
const arrowNext      = document.getElementById('arrow-next')
const drawerOverlay  = document.getElementById('drawer-overlay')
const drawerList     = document.getElementById('drawer-list')
const drawerSearch   = document.getElementById('drawer-search')
const drawerToggle   = document.getElementById('drawer-toggle')
const drawerClose    = document.getElementById('drawer-close')
const drawerBackdrop = document.getElementById('drawer-backdrop')
const tabBtns        = document.querySelectorAll('.tab-btn')
const drawerTabBtns  = document.querySelectorAll('.drawer-tab')

// ── State ──
let activeTab       = 'choruses'
let hymnIndex       = null
let chorusIndex     = null
const songCache     = new Map()   // id → full song document
let windowSongs     = []          // current 5-song render window
let windowCenter    = 0           // index in full index array
let fullIndex       = []          // current tab's full index array
let isAnimating     = false

const WINDOW_SIZE   = 5
const WINDOW_HALF   = Math.floor(WINDOW_SIZE / 2)

// ── Init ──
async function init() {
  await loadTabIndex('choruses')

  // Direct URL — check for ?id= param
  const params  = new URLSearchParams(window.location.search)
  const directId = params.get('id')

  if (directId) {
    // Find which tab it belongs to
    const chorusMatch = chorusIndex?.findIndex(s => s.id === directId)
    if (chorusMatch !== undefined && chorusMatch >= 0) {
      await jumpToIndex(chorusMatch)
    } else {
      // Try hymns
      await loadTabIndex('hymns')
      switchTab('hymns')
      const hymnMatch = hymnIndex?.findIndex(s => s.id === directId)
      if (hymnMatch !== undefined && hymnMatch >= 0) {
        await jumpToIndex(hymnMatch)
      }
    }
  } else {
    await jumpToIndex(0)
  }
}

// ── Load index for a tab ──
async function loadTabIndex(tab) {
  if (tab === 'choruses' && chorusIndex) return chorusIndex
  if (tab === 'hymns'    && hymnIndex)   return hymnIndex

  const type  = tab === 'hymns' ? 'hymn' : 'chorus'
  const songs = await getSongIndex(type)

  if (tab === 'choruses') chorusIndex = songs
  else                    hymnIndex   = songs

  return songs
}

// ── Switch tab ──
async function switchTab(tab) {
  if (tab === activeTab) return
  activeTab = tab

  tabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  drawerTabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))

  await loadTabIndex(tab)
  fullIndex = tab === 'hymns' ? hymnIndex : chorusIndex
  renderDrawerList(fullIndex)
  await jumpToIndex(0)
}

// ── Fetch a window of songs centred on index ──
async function fetchWindow(centerIdx) {
  const index = fullIndex
  const start = Math.max(0, centerIdx - WINDOW_HALF)
  const end   = Math.min(index.length - 1, centerIdx + WINDOW_HALF)
  const needed = []

  for (let i = start; i <= end; i++) {
    if (!songCache.has(index[i].id)) {
      needed.push(index[i].id)
    }
  }

  // Fetch missing songs in parallel
  if (needed.length > 0) {
    const fetched = await Promise.all(needed.map(id => getSong(id)))
    fetched.forEach(song => { if (song) songCache.set(song.id, song) })
  }

  // Pre-fetch song just outside window silently
  const prefetch = [start - 1, end + 1]
  prefetch.forEach(i => {
    if (i >= 0 && i < index.length && !songCache.has(index[i].id)) {
      getSong(index[i].id).then(s => { if (s) songCache.set(s.id, s) })
    }
  })

  return Array.from({ length: end - start + 1 }, (_, i) => {
    const entry = index[start + i]
    return songCache.get(entry.id) || { ...entry, lyrics: [] }
  })
}

// ── Jump to index position ──
async function jumpToIndex(idx) {
  windowCenter  = Math.max(0, Math.min(idx, fullIndex.length - 1))
  windowSongs   = await fetchWindow(windowCenter)
  renderCarousel()
  renderNavDots()
  updateURL()
}

// ── Render carousel ──
function renderCarousel() {
  carouselTrack.innerHTML = ''
  const localCenter = windowCenter - Math.max(0, windowCenter - WINDOW_HALF)

  windowSongs.forEach((song, i) => {
    const card = buildCard(song, i === localCenter)
    carouselTrack.appendChild(card)
  })

  // Position track so center card is centred
  positionTrack(localCenter)
  updateArrows()
}

function positionTrack(localCenter) {
  const cards     = carouselTrack.querySelectorAll('.song-card')
  if (!cards.length) return
  const areaWidth = carouselArea.offsetWidth
  const cardWidth = cards[localCenter]?.offsetWidth || 280
  const gap       = 16

  let offset = 0
  for (let i = 0; i < localCenter; i++) {
    offset += (cards[i]?.offsetWidth || 260) + gap
  }
  offset = offset - (areaWidth / 2) + (cardWidth / 2)
  carouselTrack.style.transform = `translateX(${-offset}px)`
}

// ── Build a single card ──
function buildCard(song, isActive) {
  const card = document.createElement('div')
  card.className = `song-card ${isActive ? 'active' : 'side'}`
  card.dataset.id = song.id

  const typeLabel = song.type === 'hymn' ? 'Hymn' : 'Chorus'
  const tags = (song.tags || [])
    .map(t => `<span class="tag">${t}</span>`).join('')

  card.innerHTML = `
    <div class="card-head">
      <div class="card-meta-top">
        <span class="card-type-pill pill-${song.type}">${typeLabel} ${song.number}</span>
        ${song.key
          ? `<span class="card-key-badge">${song.key}</span>`
          : ''}
      </div>
      <h2 class="card-title">${song.title}</h2>
      ${song.author
        ? `<p class="card-author">${song.author}</p>`
        : ''}
      ${tags
        ? `<div class="card-tags">${tags}</div>`
        : ''}
    </div>
    <div class="piano-accent">
      <span class="wk"></span><span class="bk"></span>
      <span class="wk"></span><span class="bk"></span>
      <span class="wk"></span><span class="wk"></span>
      <span class="bk"></span><span class="wk"></span>
      <span class="bk"></span><span class="wk"></span>
      <span class="bk"></span><span class="wk"></span>
    </div>
    <div class="card-body">
      ${renderLyrics(song)}
    </div>
    <div class="card-share">
      <button class="share-btn" data-id="${song.id}">Share song</button>
    </div>`

  // Share button
  card.querySelector('.share-btn').addEventListener('click', (e) => {
    e.stopPropagation()
    const url = `${window.location.origin}${import.meta.env.BASE_URL}?id=${song.id}`
    navigator.clipboard.writeText(url).then(() => {
      const btn = card.querySelector('.share-btn')
      btn.textContent = 'Link copied!'
      setTimeout(() => btn.textContent = 'Share song', 2000)
    })
  })

  // Clicking a side card navigates to it
  if (!isActive) {
    card.addEventListener('click', () => {
      const direction = Array.from(carouselTrack.children).indexOf(card) 
        Array.from(carouselTrack.children).findIndex(c => c.classList.contains('active'))
        ? -1 : 1
      navigate(direction)
    })
  }

  return card
}

// ── Lyrics renderer ──
function renderLyrics(song) {
  if (!song.lyrics || song.lyrics.length === 0) {
    return `<p class="state-message">Loading...</p>`
  }
  return song.lyrics.map(stanza => {
    const isRefrain = stanza.type === 'refrain' ||
                      stanza.type === 'refrain-alt'
    const lines = (stanza.lines || [])
      .map(l => `<span class="lyric-line">${l}</span>`).join('')
    return `
      <div class="stanza ${isRefrain ? 'stanza-refrain' : ''}">
        ${stanza.label
          ? `<div class="stanza-label">${stanza.label}</div>`
          : ''}
        <div class="stanza-lines">${lines}</div>
      </div>`
  }).join('')
}

// ── Navigate ──
async function navigate(direction) {
  if (isAnimating) return
  const newCenter = windowCenter + direction
  if (newCenter < 0 || newCenter >= fullIndex.length) return

  isAnimating = true
  await jumpToIndex(newCenter)
  updateDrawerHighlight()
  setTimeout(() => isAnimating = false, 350)
}

// ── Arrows ──
arrowPrev.addEventListener('click', () => navigate(-1))
arrowNext.addEventListener('click', () => navigate(1))

function updateArrows() {
  arrowPrev.style.opacity = windowCenter === 0 ? '0.2' : '1'
  arrowNext.style.opacity =
    windowCenter >= fullIndex.length - 1 ? '0.2' : '1'
  arrowPrev.disabled = windowCenter === 0
  arrowNext.disabled = windowCenter >= fullIndex.length - 1
}

// ── Keyboard navigation ──
document.addEventListener('keydown', (e) => {
  if (drawerOverlay.classList.contains('open')) return
  if (e.key === 'ArrowLeft')  navigate(-1)
  if (e.key === 'ArrowRight') navigate(1)
})

// ── Swipe gestures ──
let touchStartX  = 0
let touchStartY  = 0

carouselArea.addEventListener('touchstart', (e) => {
  touchStartX = e.touches[0].clientX
  touchStartY = e.touches[0].clientY
}, { passive: true })

carouselArea.addEventListener('touchend', (e) => {
  const dx = touchStartX - e.changedTouches[0].clientX
  const dy = touchStartY - e.changedTouches[0].clientY
  if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 40) {
    navigate(dx > 0 ? 1 : -1)
  }
}, { passive: true })

// ── Nav dots ──
function renderNavDots() {
  const total    = fullIndex.length
  const maxDots  = 7
  navDotsEl.innerHTML = ''

  if (total <= maxDots) {
    fullIndex.forEach((_, i) => {
      const dot = document.createElement('div')
      dot.className = `nav-dot ${i === windowCenter ? 'active' : ''}`
      dot.addEventListener('click', () => jumpToIndex(i))
      navDotsEl.appendChild(dot)
    })
  } else {
    // Show position as text for large collections
    const label = document.createElement('span')
    label.className = 'nav-position'
    label.textContent =
      `${windowCenter + 1} of ${total}`
    navDotsEl.appendChild(label)
  }
}

// ── Drawer ──
function openDrawer() {
  drawerOverlay.classList.add('open')
  drawerOverlay.setAttribute('aria-hidden', 'false')
  drawerSearch.focus()
  renderDrawerList(fullIndex)
  updateDrawerHighlight()
}

function closeDrawer() {
  drawerOverlay.classList.remove('open')
  drawerOverlay.setAttribute('aria-hidden', 'true')
  drawerSearch.value = ''
}

drawerToggle.addEventListener('click',  openDrawer)
drawerClose.addEventListener('click',   closeDrawer)
drawerBackdrop.addEventListener('click', closeDrawer)

// Drawer tab switching
drawerTabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    closeDrawer()
    await switchTab(btn.dataset.tab)
    openDrawer()
  })
})

// Main tab switching
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

// ── Drawer list render ──
function renderDrawerList(songs) {
  if (!songs || songs.length === 0) {
    drawerList.innerHTML =
      `<div class="state-message" style="color:#9A9690;">No songs found.</div>`
    return
  }
  drawerList.innerHTML = songs.map((song, i) => `
    <div class="drawer-row ${i === windowCenter ? 'active' : ''}"
         data-index="${i}">
      <span class="drawer-num">${song.number}</span>
      <span class="drawer-song-title">${song.title}</span>
    </div>`).join('')

  drawerList.querySelectorAll('.drawer-row').forEach(row => {
    row.addEventListener('click', async () => {
      const idx = parseInt(row.dataset.index)
      closeDrawer()
      await jumpToIndex(idx)
      updateDrawerHighlight()
    })
  })

  // Scroll active row into view
  const activeRow = drawerList.querySelector('.drawer-row.active')
  if (activeRow) activeRow.scrollIntoView({ block: 'center' })
}

// ── Drawer search ──
drawerSearch.addEventListener('input', () => {
  const q = drawerSearch.value.toLowerCase().trim()
  if (!q) {
    renderDrawerList(fullIndex)
    return
  }
  const filtered = fullIndex.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.number.toString() === q
  )
  renderDrawerList(filtered)
})

// ── Update drawer highlight ──
function updateDrawerHighlight() {
  drawerList.querySelectorAll('.drawer-row').forEach(row => {
    row.classList.toggle(
      'active',
      parseInt(row.dataset.index) === windowCenter
    )
  })
}

// ── Update URL for sharing ──
function updateURL() {
  const song = fullIndex[windowCenter]
  if (!song) return
  const url = `${window.location.pathname}?id=${song.id}`
  window.history.replaceState({}, '', url)
}

// ── Handle browser back/forward ──
window.addEventListener('popstate', () => {
  const params   = new URLSearchParams(window.location.search)
  const id       = params.get('id')
  if (!id) return
  const idx = fullIndex.findIndex(s => s.id === id)
  if (idx >= 0) jumpToIndex(idx)
})

// ── Resize handler ──
window.addEventListener('resize', () => {
  const localCenter =
    windowCenter - Math.max(0, windowCenter - WINDOW_HALF)
  positionTrack(localCenter)
})

// ── Start ──
fullIndex = chorusIndex || []
init()