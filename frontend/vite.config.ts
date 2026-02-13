import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const OPTIONAL_INITIAL_UI_CHUNK_MARKERS = [
	'vendor-ui-picker-',
	'vendor-ui-tree-',
	'vendor-ui-form-',
	'vendor-ui-upload-',
	'vendor-ui-tabs-',
] as const

function chunkGroupForModule(id: string): string | undefined {
	if (!id.includes('node_modules/')) return undefined
	// Split out a few heavy-but-not-always-needed UI deps so they can be loaded later.
	if (
		id.includes('/node_modules/@rc-component/picker/') ||
		id.includes('/node_modules/rc-picker/') ||
		id.includes('/node_modules/antd/es/date-picker/') ||
		id.includes('/node_modules/antd/es/calendar/')
	) {
		return 'vendor-ui-picker'
	}
	if (
		id.includes('/node_modules/@rc-component/form/') ||
		id.includes('/node_modules/@rc-component/async-validator/') ||
		id.includes('/node_modules/antd/es/form/')
	) {
		return 'vendor-ui-form'
	}
	if (
		id.includes('/node_modules/@rc-component/upload/') ||
		id.includes('/node_modules/rc-upload/') ||
		id.includes('/node_modules/antd/es/upload/')
	) {
		return 'vendor-ui-upload'
	}
	if (id.includes('/node_modules/@rc-component/tabs/') || id.includes('/node_modules/antd/es/tabs/')) {
		return 'vendor-ui-tabs'
	}
	if (
		id.includes('/node_modules/@rc-component/tree/') ||
		id.includes('/node_modules/rc-tree/') ||
		id.includes('/node_modules/antd/es/tree/')
	) {
		return 'vendor-ui-tree'
	}
	if (id.includes('/node_modules/@ant-design/icons/') || id.includes('/node_modules/@ant-design/icons-svg/')) {
		return 'vendor-ui-icons'
	}
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
export default defineConfig(({ mode }) => {
	const analyze = mode === 'analyze' || process.env.ANALYZE === '1'
	const plugins = [...react()]
	if (analyze) {
		plugins.push(
			visualizer({
				filename: 'dist/stats.html',
				template: 'treemap',
				gzipSize: true,
				brotliSize: true,
				open: false,
			}),
		)
		plugins.push(
			visualizer({
				filename: 'dist/stats.json',
				template: 'raw-data',
				gzipSize: true,
				brotliSize: true,
			}),
		)
	}

	return {
		plugins,
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
			modulePreload: {
				resolveDependencies: (_filename, deps, context) => {
					// Keep route-level UI bundles out of initial /profiles HTML preload.
					if (context.hostType !== 'html') return deps
					return deps.filter((dep) => !OPTIONAL_INITIAL_UI_CHUNK_MARKERS.some((marker) => dep.includes(marker)))
				},
			},
			rollupOptions: {
				output: {
					manualChunks(id) {
						return chunkGroupForModule(id)
					},
				},
			},
		},
	}
})
