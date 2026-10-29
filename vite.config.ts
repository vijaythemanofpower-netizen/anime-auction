/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site from /<repository>/; set by the deploy workflow.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  // Two pages: the game, and the Host Portal for admins.
  build: { rollupOptions: { input: { main: 'index.html', admin: 'admin.html' } } },
  server: { port: 5173, strictPort: false },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
