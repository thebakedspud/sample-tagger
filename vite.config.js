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
    pool: 'threads',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'lcov'],
      thresholds: {
        statements: 60,
        branches: 55,
        functions: 70,
        lines: 60,
      },
    },
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
