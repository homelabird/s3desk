import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: false,
        ws: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('react-router')) return 'router'
          if (id.includes('react')) return 'react'
          if (id.includes('@tanstack')) return 'tanstack'
          if (
            id.includes('node_modules/antd') ||
            id.includes('node_modules/@ant-design') ||
            id.includes('node_modules/@rc-component') ||
            id.includes('node_modules/rc-')
          ) {
            return 'antd'
          }
          if (id.includes('dayjs')) return 'dayjs'
          return 'vendor'
        },
      },
    },
  },
})
