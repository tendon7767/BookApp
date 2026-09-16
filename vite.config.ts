import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  base: '/BookApp/',
  build: { target: ['es2022', 'safari17'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        id: '/BookApp/',
        name: '看書',
        short_name: '看書',
        description: '無廣告，留白給故事。你的隨身離線閱讀角落。',
        lang: 'zh-Hant',
        start_url: '/BookApp/',
        scope: '/BookApp/',
        display: 'standalone',
        theme_color: '#f6f3ec',
        background_color: '#f6f3ec',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'icons/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Only cache the application shell; books and OAuth tokens do not belong here.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
        navigateFallbackAllowlist: [/^\/BookApp\/(?:index\.html)?$/],
        cleanupOutdatedCaches: true,
        skipWaiting: false,
        clientsClaim: true,
      },
      devOptions: { enabled: false },
    }),
  ],
})
