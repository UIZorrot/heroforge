import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const ollamaApiKey = env.OLLAMA_API_KEY || env.VITE_OLLAMA_API_KEY

  return {
    plugins: [react()],
    server: {
      proxy: {
        '/api/ollama': {
          target: 'https://ollama.com/api',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/ollama/, ''),
          headers: ollamaApiKey ? { Authorization: `Bearer ${ollamaApiKey}` } : undefined,
        },
      },
    },
  }
})
