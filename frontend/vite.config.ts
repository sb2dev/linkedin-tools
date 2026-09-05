import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

// Declared locally rather than widening this file to Node's global types for two variables.
declare const process: { env: Record<string, string | undefined> };

/** The dev server proxies /api to the backend so the app has a single origin in every environment. */
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: Number(process.env.PORT ?? 5173),
    proxy: {
      '/api': {
        target: process.env.API_URL ?? 'http://localhost:3100',
        changeOrigin: true,
      },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
