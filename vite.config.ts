import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    /** If 5173 is still taken, fail fast instead of silently binding 5174+ (avoids “wrong port” confusion). */
    strictPort: true,
  },
});
