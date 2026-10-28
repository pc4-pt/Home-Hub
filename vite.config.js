import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // works from GitHub Pages sub-paths, Vercel, or a box on the LAN
  build: { target: ['es2019', 'chrome80'] }, // older Fire OS WebViews
});
