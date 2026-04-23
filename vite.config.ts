import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  optimizeDeps: {
    // Avoid dev-server "Failed to resolve framer-motion" / cold-cache issues on the Prism glyph
    include: ['framer-motion', 'motion-dom'],
  },
  server: {
    port: 5173,
    /** If 5173 is still taken, fail fast instead of silently binding 5174+ (avoids “wrong port” confusion). */
    strictPort: true,
  },
});
