import path from 'node:path'
import { execSync } from 'node:child_process'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

function getAppVersion() {
  try {
    const commitCount = execSync('git rev-list --count HEAD', { encoding: 'utf8' }).trim()
    return `2026.${commitCount}`
  } catch {
    return '2026.0'
  }
}

export default defineConfig(({ mode }) => ({
  base: mode === 'production' ? '/bubble-experience/' : '/',
  define: {
    __APP_VERSION__: JSON.stringify(getAppVersion()),
  },
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
}))
