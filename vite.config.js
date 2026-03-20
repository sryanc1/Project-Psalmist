import { defineConfig }  from 'vite'
import { resolve }       from 'path'
import { VitePWA }       from 'vite-plugin-pwa'

export default defineConfig({
  base: '/Project-Psalmist/',
  root: 'src',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main:  resolve(__dirname, 'src/index.html'),
        song:  resolve(__dirname, 'src/pages/song.html'),
        admin: resolve(__dirname, 'src/pages/admin.html'),
        login: resolve(__dirname, 'src/pages/login.html'),
      }
    }
  },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      base: '/Project-Psalmist/',
      scope: '/Project-Psalmist/',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: null,
        runtimeCaching: [
          // Google Fonts — cache first
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }
            }
          },
          // Firestore API — network first, fallback to cache
          {
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'firestore-cache',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 }
            }
          }
        ]
      },
      manifest: {
        name: 'Project Psalmist',
        short_name: 'Psalmist',
        description: 'Digital hymn and chorus songbook',
        theme_color: '#1C1C1A',
        background_color: '#1C1C1A',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/Project-Psalmist/',
        start_url: '/Project-Psalmist/',
        icons: [
          {
            src: '/Project-Psalmist/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/Project-Psalmist/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/Project-Psalmist/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ]
})