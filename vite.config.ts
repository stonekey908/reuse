import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: '.',
  build: {
    outDir: 'dist-web',
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3210',
    },
  },
});
