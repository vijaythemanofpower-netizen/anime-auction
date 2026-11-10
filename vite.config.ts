/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // GitHub Pages serves the site from /<repository>/; set by the deploy workflow.
  base: process.env.BASE_PATH ?? '/',
  plugins: [react()],
  server: {
    // 5174, so it can run next to the anime game's dev server on 5173.
    port: 5174, strictPort: false,
    watch: { ignored: ['**/.tasks/**', '**/port/**'] },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'port/**'],
  },
});
