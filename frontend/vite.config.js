import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        // Sem timeout para suportar SSE (conexões longas como /qr-stream)
        timeout: 0,
        proxyTimeout: 0,
        configure: (proxy) => {
          proxy.on('error', (err, req, _res) => {
            // ECONNRESET é esperado quando o usuário fecha o modal SSE
            if (err.code === 'ECONNRESET') return;
            console.error('[proxy]', err.message, req.url);
          });
        },
      },
    },
  },
});
