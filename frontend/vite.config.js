import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tire Shop POS: Vite build config
// DunganSoft Technologies, March 2026

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    // Proxy API calls to the PHP backend during development.
    // In production, the web server (Apache/Nginx) handles this routing.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
});
