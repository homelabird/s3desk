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
	// Rollup CommonJS interop helpers can get deduped into arbitrary chunks.
	// Keep them in a core chunk so optional libraries (like YAML) don't get pulled
	// into the initial bundle via helper re-exports.
	if (id.includes('commonjsHelpers')) return 'vendor-misc'
	if (!id.includes('node_modules/')) return undefined
	// Keep antd's CSS-in-JS deps out of the /profiles light-shell preload.
	if (
		id.includes('/node_modules/stylis/') ||
		id.includes('/node_modules/@emotion/') ||
		id.includes('/node_modules/scroll-into-view-if-needed/') ||
		id.includes('/node_modules/compute-scroll-into-view/') ||
		id.includes('/node_modules/is-mobile/') ||
		id.includes('/node_modules/react-is/') ||
		id.includes('/node_modules/throttle-debounce/')
	) {
		return 'vendor-ui'
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
	// Keep virtualization libs out of the base tanstack chunk so /profiles stays light.
	if (id.includes('/node_modules/@tanstack/virtual-core/') || id.includes('/node_modules/@tanstack/react-virtual/')) {
		return 'vendor-tanstack-virtual'
	}
	if (id.includes('/node_modules/@tanstack/')) return 'vendor-tanstack'
	if (id.includes('/node_modules/react-dom/')) return 'vendor-react-dom'
	if (id.includes('/node_modules/react-router-dom/') || id.includes('/node_modules/react-router/')) return 'vendor-react-router'
	if (id.includes('/node_modules/react/') || id.includes('/node_modules/scheduler/')) return 'vendor-react'
	if (id.includes('/node_modules/dayjs/') || id.includes('/node_modules/yaml/')) return 'vendor-data'
	return 'vendor-misc'
}

const DEFAULT_DEV_PROXY_TARGET = 'http://127.0.0.1:8080'

function normalizeProxyHost(host: string): string {
	const h = host.trim()
	if (h === '' || h === '0.0.0.0' || h === '::') return '127.0.0.1'
	return h
}

function parseBackendAddr(addr: string): { host: string; port: string } | null {
	const a = addr.trim()
	if (!a) return null

	// Best-effort support if someone provides a full URL.
	if (a.startsWith('http://') || a.startsWith('https://')) {
		try {
			const u = new URL(a)
			if (!u.hostname) return null
			return { host: u.hostname, port: u.port || '8080' }
		} catch {
			return null
		}
	}

	const ipv6 = a.match(/^\[([^\]]+)\]:(\d+)$/)
	if (ipv6) return { host: ipv6[1], port: ipv6[2] }

	const hostPort = a.match(/^([^:]*):(\d+)$/)
	if (hostPort) return { host: hostPort[1], port: hostPort[2] }

	return null
}

function formatProxyTarget(host: string, port: string): string {
	const h = normalizeProxyHost(host)
	if (h.includes(':')) return `http://[${h}]:${port}`
	return `http://${h}:${port}`
}

function resolveDevProxyTarget(): string {
	const explicit = process.env.S3DESK_DEV_PROXY_TARGET
	if (explicit) return explicit

	const backendAddr = process.env.S3DESK_BACKEND_ADDR || process.env.ADDR
	if (backendAddr) {
		const parsed = parseBackendAddr(backendAddr)
		if (parsed) return formatProxyTarget(parsed.host, parsed.port)
	}
	return DEFAULT_DEV_PROXY_TARGET
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
	const analyze = mode === 'analyze' || process.env.ANALYZE === '1'
	const devProxyTarget = resolveDevProxyTarget()
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
					target: devProxyTarget,
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
