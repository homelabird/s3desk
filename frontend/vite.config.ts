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
          if (id.includes('node_modules/@ant-design/icons') || id.includes('node_modules/@ant-design/icons-svg')) {
            return 'antd-icons'
          }
          if (id.includes('node_modules/antd/es/') || id.includes('node_modules/antd/lib/')) {
            const base = id.includes('node_modules/antd/es/') ? 'node_modules/antd/es/' : 'node_modules/antd/lib/'
            const rel = id.split(base)[1]
            const part = rel?.split('/')[0]
            if (!part || ['style', 'theme', 'locale', 'version', '_util', 'config-provider'].includes(part)) {
              return 'antd-core'
            }
            return `antd-${part}`
          }
          if (
            id.includes('node_modules/@rc-component') ||
            id.includes('node_modules/rc-')
          ) {
            return 'antd-rc'
          }
          if (id.includes('node_modules/antd')) return 'antd-core'
          if (id.includes('node_modules/@ant-design')) return 'antd-utils'
          if (id.includes('dayjs')) return 'dayjs'
          return 'vendor'
        },
      },
    },
  },
})
