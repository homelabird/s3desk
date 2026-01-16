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
          if (
            id.includes('node_modules/antd') ||
            id.includes('node_modules/@ant-design') ||
            id.includes('node_modules/@rc-component') ||
            id.includes('node_modules/rc-')
          ) {
            const extraMatches = [
              'antd/es/table',
              'antd/es/date-picker',
              'antd/es/upload',
              'antd/es/tree',
              'antd/es/drawer',
              'antd/es/modal',
              'antd/es/tooltip',
              'antd/es/dropdown',
              'antd/es/menu',
              'antd/es/select',
              'antd/es/form',
              'rc-table',
              'rc-picker',
              'rc-upload',
              'rc-tree',
              'rc-virtual-list',
              'rc-dialog',
              'rc-drawer',
              'rc-dropdown',
              'rc-menu',
              'rc-select',
              'rc-trigger',
            ]
            if (extraMatches.some((match) => id.includes(match))) {
              return 'antd-extra'
            }
            return 'antd-core'
          }
          if (id.includes('dayjs')) return 'dayjs'
          return 'vendor'
        },
      },
    },
  },
})
