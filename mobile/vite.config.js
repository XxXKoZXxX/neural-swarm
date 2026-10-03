import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The app is served from its own origin (Vercel/Netlify/Pages) or straight off
// a dev server on the phone. APP_BASE lets a sub-path deployment work without
// touching this file.
export default defineConfig({
  plugins: [react()],
  base: process.env.APP_BASE || '/',
  server: {
    host: true,
    port: 5174,
    strictPort: true,
    // Preview hosts (*.e2b.app) and LAN IPs must be accepted or the phone
    // cannot reach the dev server.
    allowedHosts: true,
  },
  preview: {
    host: true,
    port: 4174,
    strictPort: true,
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    sourcemap: false,
  },
})
