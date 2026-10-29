import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  base: '/',
  // the town's chunk is three.js, loaded only by the Stage; it is meant to be big
  build: { outDir: '../../plugin/dist/web', emptyOutDir: true, assetsDir: 'assets', chunkSizeWarningLimit: 700 },
})
