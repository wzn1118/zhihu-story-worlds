import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Published art is served directly by Express; copying several GB into
  // dist on every frontend build blocks Vite and can lock files on Windows.
  publicDir: false,
  // Keep the large published-art directory intact during rebuilds. Artwork is
  // content-addressed and published independently from the frontend bundle;
  // deleting it makes Windows builds fail when a viewer/server holds a file.
  build: {
    emptyOutDir: false,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom'],
          icons: ['lucide-react'],
          ink: ['inkjs'],
        },
      },
    },
  },
  server: {
    host: '127.0.0.1',
    // Art refresh polls the manifests; watching these Windows files can keep
    // replacement targets open and block the publisher's atomic rename.
    watch: { ignored: ['**/public/generated-art/**', '**/output/**'] },
  },
  preview: { host: '127.0.0.1' },
});
