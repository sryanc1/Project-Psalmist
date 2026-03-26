const DB_NAME     = 'psalmist-cache'
const DB_VERSION  = 1
const STORE_SONGS = 'songs'

let db = null

// - Open IndexedDB -
async function openDB() {
  if (db) return db
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = (e) => {
      const database = e.target.result
      if (!database.objectStoreNames.contains(STORE_SONGS)) {
        database.createObjectStore(STORE_SONGS, { keyPath: 'id' })
      }
    }
    req.onsuccess = (e) => { db = e.target.result; resolve(db) }
    req.onerror   = (e) => reject(e.target.error)
  })
}

// - Get one song -
export async function idbGet(id) {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = database.transaction(STORE_SONGS, 'readonly')
      const req = tx.objectStore(STORE_SONGS).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}

// - Store one song -
export async function idbSet(song) {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = database.transaction(STORE_SONGS, 'readwrite')
      const req = tx.objectStore(STORE_SONGS).put(song)
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}

// - Clear all songs (used when rebuilding index) -
export async function idbClear() {
  try {
    const database = await openDB()
    return new Promise((resolve, reject) => {
      const tx  = database.transaction(STORE_SONGS, 'readwrite')
      const req = tx.objectStore(STORE_SONGS).clear()
      req.onsuccess = () => resolve()
      req.onerror   = () => reject(req.error)
    })
  } catch { return null }
}