import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev the React app (5173) proxies API + WebSocket traffic to the Node server (4000)
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:4000',
      '/socket.io': { target: 'http://localhost:4000', ws: true },
    },
  },
});
