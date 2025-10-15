import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const SPOTIFY_OEMBED_PROXY = '/api/spotify/oembed'
const SPOTIFY_TOKEN_PROXY = '/api/spotify/token'

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
      [SPOTIFY_TOKEN_PROXY]: {
        target: 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
    },
  },
})
