import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 650 },
});
