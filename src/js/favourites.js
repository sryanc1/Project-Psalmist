const STORAGE_KEY = 'psalmist-favourites'

// ── Read ──
export function getFavourites() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch { return [] }
}

// ── Write ──
function saveFavourites(ids) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(ids))
}

// ── Toggle ──
export function toggleFavourite(id) {
  const favs = getFavourites()
  const idx  = favs.indexOf(id)
  if (idx >= 0) {
    favs.splice(idx, 1)
  } else {
    favs.push(id)
  }
  saveFavourites(favs)
  return favs.includes(id)
}

// ── Check ──
export function isFavourite(id) {
  return getFavourites().includes(id)
}