import { auth }               from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongIndex, getSong } from './songs.js'
import { signInWithGoogle }   from './auth.js'
import { idbGet, idbSet }     from './cache.js'

// - Auth -
onAuthStateChanged(auth, (user) => {
  const adminBtn = document.getElementById('admin-link')
  if (!adminBtn) return
  adminBtn.style.display = 'block'
  adminBtn.disabled = false

  if (user) {
    adminBtn.textContent = '✓ Admin Panel'
    adminBtn.classList.add('authenticated')
    adminBtn.onclick = () => {
      window.location.href =
        `${import.meta.env.BASE_URL}pages/admin.html`
    }
  } else {
    adminBtn.textContent = 'Admin Sign In'
    adminBtn.classList.remove('authenticated')
    adminBtn.onclick = async () => {
      try {
        adminBtn.textContent = 'Signing in...'
        adminBtn.disabled = true
        await signInWithGoogle()
      } catch (err) {
        console.error('Sign in failed:', err)
        adminBtn.textContent = 'Admin Sign In'
        adminBtn.disabled = false
      }
    }
  }
})

// - Elements -
const carouselTrack = document.getElementById('carousel-track')
const carouselArea = document.getElementById('carousel-area')
const navDotsEl = document.getElementById('nav-dots')
const arrowPrev = document.getElementById('arrow-prev')
const arrowNext = document.getElementById('arrow-next')
const drawerOverlay = document.getElementById('drawer-overlay')
const drawerList = document.getElementById('drawer-list')
const drawerSearch = document.getElementById('drawer-search')
const drawerToggle = document.getElementById('drawer-toggle')
const drawerClose = document.getElementById('drawer-close')
const drawerBackdrop = document.getElementById('drawer-backdrop')
const tabBtns = document.querySelectorAll('.tab-btn')
const drawerTabBtns = document.querySelectorAll('.drawer-tab')

// - State -
let activeTab = 'choruses'
let hymnIndex = null
let chorusIndex = null
let fullIndex = []
let windowCenter = 0
let isAnimating = false

// - Three-tier cache -
const memoryCache = new Map()

async function getCachedSong(id, indexUpdatedAt = 0) {
  // Layer 1 — memory
  if (memoryCache.has(id)) {
    const cached = memoryCache.get(id)
    const cachedAt = cached._cachedAt || 0
    if (!indexUpdatedAt || cachedAt >= indexUpdatedAt) {
      return cached
    }
    // Stale — evict from memory
    memoryCache.delete(id)
  }

  // Layer 2 — IndexedDB
  const cached = await idbGet(id, indexUpdatedAt)
  if (cached) {
    memoryCache.set(id, cached)
    return cached
  }

  // Layer 3 — Firestore
  try {
    const song = await getSong(id)
    if (song) {
      // Stamp _cachedAt on BOTH memory and IndexedDB copies
      const stamped = { ...song, _cachedAt: Date.now() }
      memoryCache.set(id, stamped)
      idbSet(stamped)
      return stamped
    }
    return null
  } catch { return null }
}

// - Card metrics -
let cardWidth = 320
let cardGap = 16
let centerOffset = 0

function updateMetrics() {
  const first = carouselTrack.querySelector('.song-card')
  if (first) cardWidth = first.offsetWidth
  centerOffset = (carouselArea.offsetWidth - cardWidth) / 2
}

function getTransformForIndex(idx) {
  return -(idx * (cardWidth + cardGap)) + centerOffset
}

// - Build full scaffold -
function buildTrack() {
  carouselTrack.innerHTML = ''
  carouselTrack.style.transition = 'none'
  carouselTrack.style.transform = ''

  fullIndex.forEach((entry, i) => {
    const card = document.createElement('div')
    card.className = 'song-card side empty'
    card.dataset.id = entry.id
    card.dataset.index = i
    card.dataset.populated = 'false'
    carouselTrack.appendChild(card)
  })

  // Read actual card width after render
  requestAnimationFrame(() => {
    updateMetrics()
  })
}

// - Position track -
function positionTrack(idx, animated) {
  if (!animated) {
    carouselTrack.style.transition = 'none'
    void carouselTrack.offsetWidth // force reflow
  } else {
    carouselTrack.style.transition =
      'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)'
  }
  carouselTrack.style.transform =
    `translateX(${getTransformForIndex(idx)}px)`
}

// - Update active/side classes around center -
function updateCardClasses(center) {
  const range = 3
  const start = Math.max(0, center - range)
  const end = Math.min(fullIndex.length - 1, center + range)
  const cards = carouselTrack.querySelectorAll('.song-card')

  for (let i = start; i <= end; i++) {
    if (!cards[i]) continue
    cards[i].classList.toggle('active', i === center)
    cards[i].classList.toggle('side', i !== center)
  }
}

// - Fill a card shell with song data -
function fillCard(card, song) {
  if (!song) return
  card.dataset.populated = 'true'
  card.classList.remove('empty')

  const typeLabel = song.type === 'hymn' ? 'Hymn' : 'Chorus'
  const tags = (song.tags || [])
    .map(t => `<span class="tag">${t}</span>`).join('')

  card.innerHTML = `
    <div class="card-head">
      <div class="card-meta-top">
        <span class="card-type-pill pill-${song.type}">
          ${typeLabel} ${song.number}
        </span>
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
    <div class="card-body">
      ${renderLyrics(song)}
    </div>
    <div class="card-share">
      <button class="share-btn">Share song</button>
    </div>`

  card.querySelector('.share-btn')
    ?.addEventListener('click', (e) => {
      e.stopPropagation()
      const url =
        `${window.location.origin}${import.meta.env.BASE_URL}?id=${song.id}`
      navigator.clipboard.writeText(url).then(() => {
        const btn = card.querySelector('.share-btn')
        btn.textContent = 'Link copied!'
        setTimeout(() => btn.textContent = 'Share song', 2000)
      })
    })
}

// - Populate ±2 window -
async function populateWindow(center) {
  const start = Math.max(0, center - 2)
  const end = Math.min(fullIndex.length - 1, center + 2)
  const cards = carouselTrack.querySelectorAll('.song-card')

  const fetches = []
  for (let i = start; i <= end; i++) {
    const card = cards[i]
    if (!card) continue
    const entry = fullIndex[i]
    const id = entry.id
    const updatedAt = entry.updatedAt || 0

    // Always re-populate if stale even if card was previously filled
    const memHit = memoryCache.get(id)
    const cachedAt = memHit?._cachedAt || 0
    const isStale = memHit && updatedAt && memHit._cachedAt < updatedAt

    if (card.dataset.populated === 'true' && !isStale) continue

    // Reset populated flag if stale so fillCard reruns
    if (isStale) {
      console.log(`Stale card ${id} — cachedAt: ${cachedAt}, indexUpdatedAt: ${updatedAt}`)
      card.dataset.populated = 'false'
      memoryCache.delete(id)
    }

    fetches.push(
      getCachedSong(id, updatedAt).then(song => {
        if (song) {
          card.dataset.populated = 'false' // reset so fillCard runs
          fillCard(card, song)
        }
      })
    )
  }
  await Promise.all(fetches)

  // Silent pre-fetch
  ;[start - 1, end + 1].forEach(i => {
    if (i >= 0 && i < fullIndex.length) {
      getCachedSong(fullIndex[i].id, fullIndex[i].updatedAt || 0)
    }
  })
}

// - Lyrics renderer -
function renderLyrics(song) {
  if (!song.lyrics || song.lyrics.length === 0) {
    return `<p class="state-message">No lyrics available.</p>`
  }
  return song.lyrics.map(stanza => {
    const isRefrain =
      stanza.type === 'refrain' || stanza.type === 'refrain-alt'
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

// - Navigate -
async function navigate(direction) {
  if (isAnimating) return
  const newCenter = windowCenter + direction
  if (newCenter < 0 || newCenter >= fullIndex.length) return

  isAnimating = true
  windowCenter = newCenter

  updateCardClasses(windowCenter)
  positionTrack(windowCenter, true)

  // Wait for transition to complete
  await new Promise(resolve => {
    const onEnd = (e) => {
      if (e.propertyName !== 'transform') return
      carouselTrack.removeEventListener('transitionend', onEnd)
      resolve()
    }
    carouselTrack.addEventListener('transitionend', onEnd)
    setTimeout(resolve, 400) // safety fallback
  })

  await populateWindow(windowCenter)
  updateDrawerHighlight()
  updateURL()
  renderNavDots()
  updateArrows()

  isAnimating = false
}

// - Jump to index (no animation) -
async function jumpToIndex(idx) {
  windowCenter = Math.max(0, Math.min(idx, fullIndex.length - 1))

  updateCardClasses(windowCenter)

  // Need metrics before positioning
  requestAnimationFrame(async () => {
    updateMetrics()
    positionTrack(windowCenter, false)
    await populateWindow(windowCenter)
    renderNavDots()
    updateDrawerHighlight()
    updateURL()
    updateArrows()
  })
}

// - Switch tab -
async function switchTab(tab) {
  if (tab === activeTab && fullIndex.length > 0) return
  activeTab = tab

  tabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  drawerTabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))

  await loadTabIndex(tab)
  fullIndex = tab === 'hymns' ? hymnIndex : chorusIndex

  buildTrack()
  renderDrawerList(fullIndex)

  // Jump to random song on tab switch
  const idx = Math.floor(Math.random() * fullIndex.length)
  setTimeout(() => jumpToIndex(idx), 50)
}

// - Load index -
async function loadTabIndex(tab) {
  if (tab === 'choruses' && chorusIndex) return
  if (tab === 'hymns'    && hymnIndex)   return
  const type = tab === 'hymns' ? 'hymn' : 'chorus'
  const songs = await getSongIndex(type)
  if (tab === 'choruses') chorusIndex = songs
  else                    hymnIndex = songs
}

// - Arrows -
arrowPrev.addEventListener('click', () => navigate(-1))
arrowNext.addEventListener('click', () => navigate(1))

function updateArrows() {
  arrowPrev.style.opacity = windowCenter === 0 ? '0.2' : '1'
  arrowNext.style.opacity =
    windowCenter >= fullIndex.length - 1 ? '0.2' : '1'
  arrowPrev.disabled = windowCenter === 0
  arrowNext.disabled = windowCenter >= fullIndex.length - 1
}

// - Keyboard -
document.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowLeft')  navigate(-1)
  if (e.key === 'ArrowRight') navigate(1)
})

// - Swipe -
let touchStartX = 0
let touchStartY = 0

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

// - Nav dots -
function renderNavDots() {
  const total = fullIndex.length
  navDotsEl.innerHTML = ''

  if (total <= 7) {
    fullIndex.forEach((_, i) => {
      const dot = document.createElement('div')
      dot.className = `nav-dot ${i === windowCenter ? 'active' : ''}`
      dot.addEventListener('click', () => jumpToIndex(i))
      navDotsEl.appendChild(dot)
    })
  } else {
    const label = document.createElement('span')
    label.className = 'nav-position'
    label.textContent = `${windowCenter + 1} of ${total}`
    navDotsEl.appendChild(label)
  }
}

// - Drawer -
const isDesktop = () => window.innerWidth >= 768

function openDrawer(animate = true) {
  if (!animate) drawerOverlay.style.transition = 'none'
  drawerOverlay.classList.add('open')
  drawerOverlay.setAttribute('aria-hidden', 'false')
  if (!animate) {
    requestAnimationFrame(() => {
      drawerOverlay.style.transition = ''
    })
  }
  if (!isDesktop()) drawerSearch.focus()
}

function closeDrawer() {
  if (isDesktop()) return
  drawerOverlay.classList.remove('open')
  drawerOverlay.setAttribute('aria-hidden', 'true')
  drawerSearch.value = ''
  renderDrawerList(fullIndex)
}

if (drawerToggle) {
  drawerToggle.addEventListener('click', () => {
    drawerOverlay.classList.contains('open')
      ? closeDrawer() : openDrawer()
  })
}

if (drawerClose) drawerClose.addEventListener('click', closeDrawer)
drawerBackdrop.addEventListener('click', closeDrawer)

drawerTabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.tab === activeTab) return
    await switchTab(btn.dataset.tab)
    if (!isDesktop()) closeDrawer()
  })
})

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

// - Drawer list -
function renderDrawerList(songs) {
  if (!songs || songs.length === 0) {
    drawerList.innerHTML =
      `<div class="state-message" style="color:#9A9690;">
        No songs found.
      </div>`
    return
  }
  drawerList.innerHTML = songs.map((song, i) => {
    const globalIdx = fullIndex.findIndex(s => s.id === song.id)
    return `
      <div class="drawer-row ${globalIdx === windowCenter ? 'active' : ''}"
           data-index="${globalIdx}">
        <span class="drawer-num">${song.number}</span>
        <span class="drawer-song-title">${song.title}</span>
      </div>`
  }).join('')

  drawerList.querySelectorAll('.drawer-row').forEach(row => {
    row.addEventListener('click', async () => {
      const idx = parseInt(row.dataset.index)
      await jumpToIndex(idx)
      if (!isDesktop()) closeDrawer()
    })
  })

  requestAnimationFrame(() => {
    const active = drawerList.querySelector('.drawer-row.active')
    if (active) active.scrollIntoView({ block: 'center' })
  })
}

function updateDrawerHighlight() {
  drawerList.querySelectorAll('.drawer-row').forEach(row => {
    row.classList.toggle(
      'active',
      parseInt(row.dataset.index) === windowCenter
    )
  })
  const active = drawerList.querySelector('.drawer-row.active')
  if (active) active.scrollIntoView({ block: 'nearest' })
}

// - Drawer search -
drawerSearch.addEventListener('input', () => {
  const q = drawerSearch.value.toLowerCase().trim()
  if (!q) { renderDrawerList(fullIndex); return }
  const filtered = fullIndex.filter(s =>
    s.title.toLowerCase().includes(q) ||
    s.number.toString() === q
  )
  renderDrawerList(filtered)
})

// - URL -
function updateURL() {
  const song = fullIndex[windowCenter]
  if (!song) return
  window.history.replaceState(
    {}, '', `${window.location.pathname}?id=${song.id}`)
}

window.addEventListener('popstate', () => {
  const id = new URLSearchParams(window.location.search).get('id')
  if (!id) return
  const idx = fullIndex.findIndex(s => s.id === id)
  if (idx >= 0) jumpToIndex(idx)
})

// - Resize -
window.addEventListener('resize', () => {
  if (isDesktop() && !drawerOverlay.classList.contains('open')) {
    openDrawer(false)
  }
  updateMetrics()
  positionTrack(windowCenter, false)
})

// - Init -
async function init() {
  await loadTabIndex('choruses')
  fullIndex = chorusIndex || []

  buildTrack()
  renderDrawerList(fullIndex)

  // Check for direct URL
  const params = new URLSearchParams(window.location.search)
  const directId = params.get('id')

  if (directId) {
    const chorusMatch = chorusIndex?.findIndex(s => s.id === directId)
    if (chorusMatch !== undefined && chorusMatch >= 0) {
      setTimeout(() => jumpToIndex(chorusMatch), 50)
    } else {
      await loadTabIndex('hymns')
      await switchTab('hymns')
      const hymnMatch = hymnIndex?.findIndex(s => s.id === directId)
      if (hymnMatch !== undefined && hymnMatch >= 0) {
        setTimeout(() => jumpToIndex(hymnMatch), 50)
      } else {
        setTimeout(() => jumpToIndex(
          Math.floor(Math.random() * fullIndex.length)), 50)
      }
    }
  } else {
    setTimeout(() => jumpToIndex(
      Math.floor(Math.random() * fullIndex.length)), 50)
  }

  if (isDesktop()) openDrawer(false)
}

init()