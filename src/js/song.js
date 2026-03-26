import { getSong } from './songs.js'

// - Get song id from URL -
const params = new URLSearchParams(window.location.search)
const songId = params.get('id')

const contentEl = document.getElementById('song-content')

// - Init -
async function init() {
  if (!songId) {
    showError('No song specified.')
    return
  }

  try {
    const song = await getSong(songId)
    if (!song) {
      showError('Song not found.')
      return
    }
    document.title = `${song.title} — Project Psalmist`
    renderSong(song)
  } catch (err) {
    console.error('Failed to load song:', err)
    showError('Unable to load song. Please try again.')
  }
}

// - Render -
function renderSong(song) {
  contentEl.innerHTML = `
    <div class="song-header card">
      <div class="song-header-body">
        <div class="song-meta-top">
          <span class="type-pill pill-${song.type}">${song.type}</span>
          <span class="song-num">${song.number}</span>
        </div>
        <h1 class="song-title-heading">${song.title}</h1>
        ${song.author
          ? `<p class="song-author">${song.author}</p>`
          : ''}
        <div class="song-meta-bottom">
          ${song.key
            ? `<span class="tag tag-accent">Key of ${song.key}</span>`
            : ''}
          ${(song.tags || [])
            .map(t => `<span class="tag">${t}</span>`)
            .join('')}
        </div>
      </div>
      <div class="piano-accent">
        <span class="wk"></span><span class="bk"></span>
        <span class="wk"></span><span class="bk"></span>
        <span class="wk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
        <span class="wk"></span><span class="bk"></span>
        <span class="wk"></span><span class="bk"></span>
        <span class="wk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
        <span class="bk"></span><span class="wk"></span>
      </div>
    </div>

    <div class="song-lyrics mt-3">
      ${renderLyrics(song)}
    </div>

    <div class="song-footer mt-3">
      <a href="${import.meta.env.BASE_URL}"
         class="btn btn-outline">← Back</a>
    </div>
  `
}

// - Lyrics renderer -
function renderLyrics(song) {
  if (!song.lyrics || song.lyrics.length === 0) {
    return `<p class="state-message">No lyrics available.</p>`
  }
  return song.lyrics
    .map(stanza => renderStanza(stanza))
    .join('')
}

function renderStanza(stanza) {
  const lines = (stanza.lines || [])
    .map(line => `<span class="lyric-line">${line}</span>`)
    .join('')

  const isRefrain = stanza.type === 'refrain' ||
                    stanza.type === 'refrain-alt'

  return `
    <div class="stanza ${isRefrain ? 'stanza-refrain' : ''}">
      ${stanza.label
        ? `<div class="stanza-label">${stanza.label}</div>`
        : ''}
      <div class="stanza-lines">${lines}</div>
    </div>`
}

// - Error -
function showError(msg) {
  contentEl.innerHTML =
    `<div class="state-message">${msg}</div>`
}

init()