/// <reference types="vitest" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** dev/preview 下也提供 /healthz，方便本地与 e2e 验证（生产由 nginx 提供） */
function healthz(): Plugin {
  const handler = (_req: unknown, res: { statusCode: number; setHeader: (k: string, v: string) => void; end: (s: string) => void }) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('ok');
  };
  return {
    name: 'healthz',
    configureServer(server) {
      server.middlewares.use('/healthz', handler as never);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/healthz', handler as never);
    },
  };
}

export default defineConfig({
  plugins: [react(), healthz()],
  build: {
    chunkSizeWarningLimit: 4096,
  },
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
  },
});
