import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { crx } from '@crxjs/vite-plugin'
import { manifest } from './src/manifest'

// __dirname replacement for ESM.
const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  plugins: [react(), crx({ manifest })],
  server: {
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
    port: 5173,
    strictPort: true,
    hmr: {
      clientPort: 5173,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        devtools: resolve(rootDir, 'devtools.html'),
        panel: resolve(rootDir, 'devtools-panel.html'),
      },
      output: {},
    },
  },
})
