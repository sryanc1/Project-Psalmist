import { auth, googleProvider, db } from './firebase.js'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'
import { doc, getDoc } from 'firebase/firestore'

// ── Sign in with Google ──
export async function signInWithGoogle() {
  try {
    const result = await signInWithPopup(auth, googleProvider)
    return result.user
  } catch (err) {
    console.error('Sign in failed:', err)
    throw err
  }
}

// ── Verify user is in users collection ──
export async function verifyAdminRole(uid) {
  try {
    const ref      = doc(db, 'users', uid)
    const snapshot = await getDoc(ref)
    return snapshot.exists() && snapshot.data().role === 'admin'
  } catch {
    return false
  }
}

// ── Sign out ──
export async function signOutUser() {
  try {
    await signOut(auth)
  } catch (err) {
    console.error('Sign out failed:', err)
    throw err
  }
}

// ── Get current user ──
export function getCurrentUser() {
  return auth.currentUser
}

// ── Auth state observer ──
export function onAuthChange(callback) {
  return onAuthStateChanged(auth, callback)
}

// ── Admin guard ──
// Verifies auth AND admin role — redirects if either fails
export function requireAuth(redirectPath = null) {
  const base = import.meta.env.BASE_URL
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe()
      if (!user) {
        window.location.href = redirectPath || base
        return
      }
      const isAdmin = await verifyAdminRole(user.uid)
      if (!isAdmin) {
        await signOut(auth)
        window.location.href = redirectPath || base
        return
      }
      resolve(user)
    })
  })
}