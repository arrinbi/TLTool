import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/TLTool/',
  plugins: [react(), tailwindcss()],
  ssr: {
    noExternal: ['@techstark/opencv-js'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    server: {
      deps: {
        inline: ['@techstark/opencv-js'],
      },
    },
  },
} as import('vite').UserConfig)
