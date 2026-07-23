import { defineConfig } from 'vite';

export default defineConfig({
  base: '/wargames/',
  build: {
    chunkSizeWarningLimit: 650,
  },
});
