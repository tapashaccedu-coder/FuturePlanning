import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',   // relative paths — works on Vercel, Netlify, GitHub Pages, any subfolder
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split large dependencies into separate chunks for faster loading
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'chartjs-vendor': ['chart.js'],
        }
      }
    }
  }
})
