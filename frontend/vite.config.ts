import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    globals: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['tests/**', 'dist/**'],
  },
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
          if (id.includes('node_modules/antd/')) {
            const match = id.match(/node_modules\/antd\/es\/([^/]+)/)
            if (match) {
              const chunk = match[1]
              if (chunk === 'index.js') return 'antd-core'
              if (chunk === 'row' || chunk === 'col') return 'antd-grid'
              return `antd-${chunk}`
            }
            return 'antd-core'
          }
          if (id.includes('node_modules/@ant-design/icons')) return 'antd-icons'
          if (id.includes('node_modules/@rc-component/')) {
            const match = id.match(/node_modules\/@rc-component\/([^/]+)/)
            if (match) return `antd-${match[1]}`
            return 'antd-rc'
          }
          if (id.includes('node_modules/rc-')) {
            const match = id.match(/node_modules\/(rc-[^/]+)/)
            if (match) return `antd-${match[1]}`
            return 'antd-rc'
          }
          if (id.includes('dayjs')) return 'dayjs'
          return 'vendor'
        },
      },
    },
  },
})
