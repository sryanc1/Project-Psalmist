import { db } from './firebase.js'
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  query,
  orderBy,
  where,
  serverTimestamp
} from 'firebase/firestore'

const SONGS_COLLECTION = 'songs'
const META_COLLECTION  = 'meta'
const HYMN_INDEX_DOC   = 'hymnIndex'
const CHORUS_INDEX_DOC = 'chorusIndex'

// ── Index helpers ──
function indexDocId(type) {
  return type === 'hymn' ? HYMN_INDEX_DOC : CHORUS_INDEX_DOC
}

function toIndexEntry(song) {
  return {
    id:     song.id,
    number: song.number,
    title:  song.title,
    key:    song.key || ''
  }
}

// ── Read index (public list page) ──
export async function getSongIndex(type) {
  const ref      = doc(db, META_COLLECTION, indexDocId(type))
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return []
  return snapshot.data().songs || []
}

// ── Rebuild full index from songs collection (used after bulk ops) ──
export async function rebuildIndex(type) {
  const q        = query(
    collection(db, SONGS_COLLECTION),
    where('type', '==', type),
    orderBy('number', 'asc')
  )
  const snapshot = await getDocs(q)
  const entries  = snapshot.docs.map(d => toIndexEntry({
    id: d.id, ...d.data()
  }))
  await setDoc(doc(db, META_COLLECTION, indexDocId(type)), {
    songs:     entries,
    updatedAt: serverTimestamp()
  })
  return entries
}

// ── Patch index — add or update one entry ──
async function patchIndexAdd(type, song) {
  const current = await getSongIndex(type)
  const filtered = current.filter(s => s.id !== song.id)
  const updated  = [...filtered, toIndexEntry(song)]
    .sort((a, b) => a.number - b.number)
  await setDoc(doc(db, META_COLLECTION, indexDocId(type)), {
    songs:     updated,
    updatedAt: serverTimestamp()
  })
}

// ── Patch index — remove one entry ──
async function patchIndexRemove(type, id) {
  const current = await getSongIndex(type)
  const updated  = current.filter(s => s.id !== id)
  await setDoc(doc(db, META_COLLECTION, indexDocId(type)), {
    songs:     updated,
    updatedAt: serverTimestamp()
  })
}

// ── Get all songs flat (admin only) ──
export async function getSongs() {
  const [hymns, choruses] = await Promise.all([
    getSongsByType('hymn'),
    getSongsByType('chorus')
  ])
  return { hymns, choruses }
}

// ── Get songs by type (admin only) ──
export async function getSongsByType(type) {
  const q = query(
    collection(db, SONGS_COLLECTION),
    where('type', '==', type),
    orderBy('number', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Get single song (detail view) ──
export async function getSong(id) {
  const ref      = doc(db, SONGS_COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return { id: snapshot.id, ...snapshot.data() }
}

// ── Add new song ──
export async function addSong(songData) {
  const ref  = await addDoc(collection(db, SONGS_COLLECTION), {
    ...songData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  await patchIndexAdd(songData.type, { id: ref.id, ...songData })
  return ref.id
}

// ── Update existing song ──
export async function updateSong(id, songData, oldType) {
  const ref = doc(db, SONGS_COLLECTION, id)
  await updateDoc(ref, {
    ...songData,
    updatedAt: serverTimestamp()
  })
  // If type changed, remove from old index and add to new
  if (oldType && oldType !== songData.type) {
    await patchIndexRemove(oldType, id)
  }
  await patchIndexAdd(songData.type, { id, ...songData })
}

// ── Delete song ──
export async function deleteSong(id, type) {
  const ref = doc(db, SONGS_COLLECTION, id)
  await deleteDoc(ref)
  await patchIndexRemove(type, id)
}