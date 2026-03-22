import '../css/admin.css'
import { signInWithGoogle, onAuthChange } from './auth.js'

const signinBtn = document.getElementById('google-signin-btn')
const errorEl = document.getElementById('login-error')

// ── If already signed in redirect to admin ──
onAuthChange((user) => {
  if (user) {
    window.location.href = `${import.meta.env.BASE_URL}pages/admin.html`
  }
})

// ── Sign in button ──
signinBtn.addEventListener('click', async () => {
  errorEl.style.display = 'none'
  signinBtn.disabled = true
  signinBtn.textContent = 'Signing in...'

  try {
    await signInWithGoogle()
    // onAuthChange above handles the redirect
  } catch (err) {
    errorEl.style.display = 'block'
    signinBtn.disabled = false
    signinBtn.textContent = 'Sign in with Google'
  }
})