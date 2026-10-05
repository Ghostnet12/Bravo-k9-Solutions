import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root: 'client',
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:3001' } },
  build: {
    outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 650,
    // Lazy live routes must not import their context from the entry bundle that
    // is loading those routes. Keep the shared provider and UI outside the app bootstrap.
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'site-shared', test: /[\\/]client[\\/]src[\\/](?:live-state\.js|ui\.jsx)$/ }] } } },
  },
});
