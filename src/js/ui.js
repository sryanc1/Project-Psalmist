import { auth }               from './firebase.js'
import { onAuthStateChanged } from 'firebase/auth'
import { getSongIndex, getSong } from './songs.js'
import { signInWithGoogle, signOutUser } from './auth.js'

// - Admin nav -
onAuthStateChanged(auth, (user) => {
  const adminBtn = document.getElementById('admin-link')
  if (!adminBtn) return

  adminBtn.style.display = 'block'
  adminBtn.disabled = false  // ← always re-enable on auth state change

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
const carouselTrack   = document.getElementById('carousel-track')
const carouselArea    = document.getElementById('carousel-area')
const navDotsEl       = document.getElementById('nav-dots')
const arrowPrev       = document.getElementById('arrow-prev')
const arrowNext       = document.getElementById('arrow-next')
const drawerOverlay   = document.getElementById('drawer-overlay')
const drawerList      = document.getElementById('drawer-list')
const drawerSearch    = document.getElementById('drawer-search')
const drawerToggle    = document.getElementById('drawer-toggle')
const drawerClose     = document.getElementById('drawer-close')
const drawerBackdrop  = document.getElementById('drawer-backdrop')
const tabBtns         = document.querySelectorAll('.tab-btn')
const drawerTabBtns   = document.querySelectorAll('.drawer-tab')

// - State -
let activeTab     = 'choruses'
let hymnIndex     = null
let chorusIndex   = null
const songCache   = new Map()
let windowSongs   = []
let windowCenter  = 0
let fullIndex     = []
let isAnimating   = false

const WINDOW_SIZE = 5
const WINDOW_HALF = Math.floor(WINDOW_SIZE / 2)

// - Breakpoint -
const isDesktop = () => window.innerWidth >= 768

// - Init -
async function init() {
  await loadTabIndex('choruses')
  fullIndex = chorusIndex || []

  const params   = new URLSearchParams(window.location.search)
  const directId = params.get('id')

  if (directId) {
    const chorusMatch = chorusIndex?.findIndex(s => s.id === directId)
    if (chorusMatch !== undefined && chorusMatch >= 0) {
      await jumpToIndex(chorusMatch)
    } else {
      await loadTabIndex('hymns')
      await switchTab('hymns', false)
      const hymnMatch = hymnIndex?.findIndex(s => s.id === directId)
      if (hymnMatch !== undefined && hymnMatch >= 0) {
        await jumpToIndex(hymnMatch)
      } else {
        await jumpToIndex(randomIndex())
      }
    }
  } else {
    await jumpToIndex(randomIndex())
  }

  renderDrawerList(fullIndex)

  if (isDesktop()) {
    openDrawer(false)
  }
}

function randomIndex() {
  if (!fullIndex.length) return 0
  return Math.floor(Math.random() * fullIndex.length)
}

// - Load index -
async function loadTabIndex(tab) {
  if (tab === 'choruses' && chorusIndex) return chorusIndex
  if (tab === 'hymns'    && hymnIndex)   return hymnIndex
  const type  = tab === 'hymns' ? 'hymn' : 'chorus'
  const songs = await getSongIndex(type)
  if (tab === 'choruses') chorusIndex = songs
  else                    hymnIndex   = songs
  return songs
}

// - Switch tab -
async function switchTab(tab, jump = true) {
  if (tab === activeTab) return
  activeTab = tab

  tabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))
  drawerTabBtns.forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab))

  await loadTabIndex(tab)
  fullIndex = tab === 'hymns' ? hymnIndex : chorusIndex

  renderDrawerList(fullIndex)

  if (jump) await jumpToIndex(randomIndex())
}

// - Fetch window -
async function fetchWindow(centerIdx) {
  const start  = Math.max(0, centerIdx - WINDOW_HALF)
  const end    = Math.min(fullIndex.length - 1, centerIdx + WINDOW_HALF)
  const needed = []

  for (let i = start; i <= end; i++) {
    if (!songCache.has(fullIndex[i].id)) needed.push(fullIndex[i].id)
  }

  if (needed.length > 0) {
    const fetched = await Promise.all(needed.map(id => getSong(id)))
    fetched.forEach(s => { if (s) songCache.set(s.id, s) })
  }

  // Silent pre-fetch beyond window edges
  ;[start - 1, end + 1].forEach(i => {
    if (i >= 0 && i < fullIndex.length &&
        !songCache.has(fullIndex[i].id)) {
      getSong(fullIndex[i].id)
        .then(s => { if (s) songCache.set(s.id, s) })
    }
  })

  return Array.from({ length: end - start + 1 }, (_, i) => {
    const entry = fullIndex[start + i]
    return songCache.get(entry.id) || { ...entry, lyrics: [] }
  })
}

// - Jump to index -
async function jumpToIndex(idx) {
  windowCenter = Math.max(0, Math.min(idx, fullIndex.length - 1))
  windowSongs  = await fetchWindow(windowCenter)
  renderCarousel()
  renderNavDots()
  updateDrawerHighlight()
  updateURL()
}

// - Render carousel -
function renderCarousel() {
  const localCenter =
    windowCenter - Math.max(0, windowCenter - WINDOW_HALF)

  const existingCards = carouselTrack.querySelectorAll('.song-card')

  if (existingCards.length === windowSongs.length) {
    // ── In-place update — preserve DOM for smooth animation ──
    windowSongs.forEach((song, i) => {
      const card     = existingCards[i]
      const isActive = i === localCenter

      // Update active/side class
      card.classList.toggle('active', isActive)
      card.classList.toggle('side',   !isActive)

      // Only rebuild card content if song changed
      if (card.dataset.id !== song.id) {
        const newCard = buildCard(song, isActive)
        // Copy content but keep the same DOM node
        card.dataset.id  = song.id
        card.innerHTML   = newCard.innerHTML
        // Re-wire share button
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
        // Re-wire side card click
        if (!isActive) {
          card.onclick = () => {
            const cards   = Array.from(carouselTrack.children)
            const thisIdx = cards.indexOf(card)
            const actIdx  = cards.findIndex(c =>
              c.classList.contains('active'))
            navigate(thisIdx < actIdx ? -1 : 1)
          }
        } else {
          card.onclick = null
        }
      } else {
        // Same song — just update click handler
        if (!isActive) {
          card.onclick = () => {
            const cards   = Array.from(carouselTrack.children)
            const thisIdx = cards.indexOf(card)
            const actIdx  = cards.findIndex(c =>
              c.classList.contains('active'))
            navigate(thisIdx < actIdx ? -1 : 1)
          }
        } else {
          card.onclick = null
        }
      }
    })
  } else {
    // ── First render only — build from scratch ──
    carouselTrack.innerHTML = ''
    windowSongs.forEach((song, i) => {
      carouselTrack.appendChild(buildCard(song, i === localCenter))
    })
  }

  requestAnimationFrame(() => {
    requestAnimationFrame(() => positionTrack(localCenter))
  })
  updateArrows()
}

function positionTrack(localCenter) {
  const cards = carouselTrack.querySelectorAll('.song-card')
  if (!cards.length) return

  const areaWidth = carouselArea.offsetWidth
  if (!areaWidth) return  // guard against layout not ready

  const card      = cards[localCenter]
  if (!card) return
  const cardWidth = card.offsetWidth
  const gap       = 16

  // Sum up widths of all cards before localCenter (only cards in the DOM window)
  let offset = 0
  for (let i = 0; i < localCenter; i++) {
    offset += (cards[i]?.offsetWidth || cardWidth) + gap
  }

  // Center the active card in the viewport
  offset = offset - areaWidth / 2 + cardWidth / 2
  carouselTrack.style.transform = `translateX(${-offset}px)`
}

// - Build card -
function buildCard(song, isActive) {
  const card       = document.createElement('div')
  card.className   = `song-card ${isActive ? 'active' : 'side'}`
  card.dataset.id  = song.id

  const typeLabel  = song.type === 'hymn' ? 'Hymn' : 'Chorus'
  const tags       = (song.tags || [])
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
      <button class="share-btn" data-id="${song.id}">Share song</button>
    </div>`

  card.querySelector('.share-btn')
    .addEventListener('click', (e) => {
      e.stopPropagation()
      const url =
        `${window.location.origin}${import.meta.env.BASE_URL}?id=${song.id}`
      navigator.clipboard.writeText(url).then(() => {
        const btn = card.querySelector('.share-btn')
        btn.textContent = 'Link copied!'
        setTimeout(() => btn.textContent = 'Share song', 2000)
      })
    })

  if (!isActive) {
    card.addEventListener('click', () => {
      const cards  = Array.from(carouselTrack.children)
      const thisIdx = cards.indexOf(card)
      const actIdx  = cards.findIndex(c =>
        c.classList.contains('active'))
      navigate(thisIdx < actIdx ? -1 : 1)
    })
  }

  return card
}

// - Lyrics -
function renderLyrics(song) {
  if (!song.lyrics || song.lyrics.length === 0) {
    return `<p class="state-message">Loading...</p>`
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
  await jumpToIndex(newCenter)
  setTimeout(() => isAnimating = false, 350)
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
  const total   = fullIndex.length
  const maxDots = 7
  navDotsEl.innerHTML = ''

  if (total <= maxDots) {
    fullIndex.forEach((_, i) => {
      const dot = document.createElement('div')
      dot.className = `nav-dot ${i === windowCenter ? 'active' : ''}`
      dot.addEventListener('click', () => jumpToIndex(i))
      navDotsEl.appendChild(dot)
    })
  } else {
    const label = document.createElement('span')
    label.className   = 'nav-position'
    label.textContent = `${windowCenter + 1} of ${total}`
    navDotsEl.appendChild(label)
  }
}

// - Drawer -
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
      ? closeDrawer()
      : openDrawer()
  })
}

if (drawerClose) {
  drawerClose.addEventListener('click', closeDrawer)
}

drawerBackdrop.addEventListener('click', closeDrawer)

// - Drawer tabs -
drawerTabBtns.forEach(btn => {
  btn.addEventListener('click', async () => {
    if (btn.dataset.tab === activeTab) return
    await switchTab(btn.dataset.tab)
    if (!isDesktop()) closeDrawer()
  })
})

// - Main tabs -
tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab))
})

// - Drawer list -
function renderDrawerList(songs) {
  if (!songs || songs.length === 0) {
    drawerList.innerHTML = `
      <div class="state-message" style="color:#9A9690;">
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

// - Drawer highlight -
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

// - URL -
function updateURL() {
  const song = fullIndex[windowCenter]
  if (!song) return
  window.history.replaceState(
    {}, '', `${window.location.pathname}?id=${song.id}`)
}

window.addEventListener('popstate', () => {
  const id  = new URLSearchParams(window.location.search).get('id')
  if (!id) return
  const idx = fullIndex.findIndex(s => s.id === id)
  if (idx >= 0) jumpToIndex(idx)
})

// - Resize -
window.addEventListener('resize', () => {
  if (isDesktop() && !drawerOverlay.classList.contains('open')) {
    openDrawer(false)
  }
  const localCenter =
    windowCenter - Math.max(0, windowCenter - WINDOW_HALF)
  positionTrack(localCenter)
})

// - Start -
init()