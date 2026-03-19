import { auth, googleProvider } from './firebase.js'
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from 'firebase/auth'

// ── Sign in with Google ──
export async function signInWithGoogle() {
  try {
    await signInWithPopup(auth, googleProvider)
  } catch (err) {
    console.error('Sign in failed:', err)
    throw err
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
// Call this at the top of any admin page
// Redirects to login if not authenticated
export function requireAuth(redirectPath = `${import.meta.env.BASE_URL}pages/login.html`) {
  return new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      unsubscribe()
      if (!user) {
        window.location.href = redirectPath
      } else {
        resolve(user)
      }
    })
  })
}