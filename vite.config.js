import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo from /neural-swarm/; Vercel serves it from
  // the root. The Pages workflow sets GITHUB_PAGES so only that build is
  // rewritten - the Vercel build is untouched.
  base: process.env.GITHUB_PAGES ? '/neural-swarm/' : '/',
  server: {
    // Bind on all interfaces so container/preview proxies (E2B, Codespaces,
    // Docker) can reach the dev server, and accept any Host header so the
    // proxied preview origin is not rejected as an unknown host.
    host: true,
    allowedHosts: true,
    port: 5173,
    strictPort: false,
    watch: {
      // Test bundles (.smoke) and build output are not app code - watching them
      // makes the dev server hot-reload itself mid-test.
      ignored: ['**/.smoke/**', '**/dist/**'],
    },
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
})
