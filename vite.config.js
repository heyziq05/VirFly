import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  // Relative paths so the built site works at https://<user>.github.io/<repo>/
  base: './',
  plugins: [react()],
  server: { port: 5173, open: true },
  build: { chunkSizeWarningLimit: 1600 },
})
