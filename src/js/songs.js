import { db } from './firebase.js'
import {
  collection,
  getDocs,
  getDoc,
  doc,
  query,
  orderBy
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