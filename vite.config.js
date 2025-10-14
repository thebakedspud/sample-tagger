import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SPOTIFY_OEMBED_PROXY = '/api/spotify/oembed'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    globals: true,
    css: false,
  },
  server: {
    proxy: {
      [SPOTIFY_OEMBED_PROXY]: {
        target: 'https://open.spotify.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/api\/spotify\/oembed/, '/oembed'),
      },
    },
  },
})
