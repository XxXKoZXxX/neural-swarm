import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves this repo from /neural-swarm/; Vercel serves it from
  // the root. The Pages workflow sets GITHUB_PAGES so only that build is
  // rewritten - the Vercel build is untouched.
  base: process.env.GITHUB_PAGES ? '/neural-swarm/' : '/',
})
