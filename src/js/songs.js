import { db } from './firebase.js'
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  serverTimestamp
} from 'firebase/firestore'

const SONGS_COLLECTION = 'songs'

// ── Get all songs (list view) ──
export async function getSongs() {
  const q = query(
    collection(db, SONGS_COLLECTION),
    orderBy('title', 'asc')
  )
  const snapshot = await getDocs(q)
  return snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }))
}

// ── Get single song (detail view) ──
export async function getSong(id) {
  const ref = doc(db, SONGS_COLLECTION, id)
  const snapshot = await getDoc(ref)
  if (!snapshot.exists()) return null
  return { id: snapshot.id, ...snapshot.data() }
}

// ── Add new song ──
export async function addSong(songData) {
  const ref = await addDoc(collection(db, SONGS_COLLECTION), {
    ...songData,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  })
  return ref.id
}

// ── Update existing song ──
export async function updateSong(id, songData) {
  const ref = doc(db, SONGS_COLLECTION, id)
  await updateDoc(ref, {
    ...songData,
    updatedAt: serverTimestamp()
  })
}

// ── Delete song ──
export async function deleteSong(id) {
  const ref = doc(db, SONGS_COLLECTION, id)
  await deleteDoc(ref)
}