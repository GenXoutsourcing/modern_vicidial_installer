import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: process.env.GENX_UI_BASE_PATH || '/genx/',
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
