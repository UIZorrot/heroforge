import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollamaApiKey = env.OLLAMA_API_KEY || env.VITE_OLLAMA_API_KEY
  const assetRelease = process.env.HF_ASSET_RELEASE || ''
  if (assetRelease && !/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(assetRelease)) {
    throw new Error('HF_ASSET_RELEASE must be a short letters/numbers/hyphens/underscores release identifier')
  }

  return {
    plugins: [react()],
    build: { assetsDir: assetRelease ? `assets/${assetRelease}` : 'assets' },
    server: {
      host: '0.0.0.0',
      port: 4488,
      strictPort: true,
      proxy: {
        '/api/pve-preview': {
          target: 'http://127.0.0.1:5545',
          changeOrigin: true,
          rewrite: (path) => path.replace('/api/pve-preview', '/api/pve'),
        },
        '/api/ollama': {
          target: env.VITE_OLLAMA_PROXY_TARGET || 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ollama/, '/api'),
          headers: ollamaApiKey ? { Authorization: `Bearer ${ollamaApiKey}` } : undefined,
        },
      },
    },
  }
})
