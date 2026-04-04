import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollamaApiKey = env.OLLAMA_API_KEY || env.VITE_OLLAMA_API_KEY

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 4488,
      strictPort: true,
      proxy: {
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
