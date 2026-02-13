import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

function chunkGroupForModule(id: string): string | undefined {
	if (!id.includes('node_modules/')) return undefined
	// Keep antd + rc-* in the same chunk to avoid cross-chunk circular init ordering issues.
	if (
		id.includes('/node_modules/antd/') ||
		id.includes('/node_modules/@ant-design/') ||
		id.includes('/node_modules/@rc-component/') ||
		id.includes('/node_modules/rc-')
	) {
		return 'vendor-ui'
	}
	if (id.includes('/node_modules/@tanstack/')) return 'vendor-tanstack'
	if (id.includes('/node_modules/react-dom/')) return 'vendor-react-dom'
	if (id.includes('/node_modules/react-router-dom/') || id.includes('/node_modules/react-router/')) return 'vendor-react-router'
	if (id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react'
	if (id.includes('/node_modules/dayjs/') || id.includes('/node_modules/yaml/')) return 'vendor-data'
	return 'vendor-misc'
}

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
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          return chunkGroupForModule(id)
        },
      },
    },
  },
})
