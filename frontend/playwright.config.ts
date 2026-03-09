import { defineConfig, devices } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'
const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8080'
const recordVideos = ['1', 'true', 'on'].includes((process.env.PLAYWRIGHT_RECORD_VIDEOS || '').toLowerCase())
const recordingOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR
const shouldManageWebServer = !isLive && !process.env.PLAYWRIGHT_BASE_URL && !process.env.BASE_URL

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	...(shouldManageWebServer
		? {
				webServer: {
					command: 'npm run dev -- --host 127.0.0.1 --port 8080 --strictPort',
					url: baseURL,
					reuseExistingServer: true,
					timeout: 120_000,
				},
			}
		: {}),
	use: {
		baseURL,
		headless: true,
		viewport: { width: 1280, height: 720 },
		video: recordVideos ? 'on' : 'off',
	},
	...(recordingOutputDir ? { outputDir: recordingOutputDir } : {}),
	projects: [
		{
			name: 'chromium',
			use: {
				...devices['Desktop Chrome'],
			},
			testIgnore: /mobile-smoke\.spec\.ts/,
		},
		{
			name: 'mobile-iphone-13',
			use: {
				...devices['iPhone 13'],
				// Keep iPhone viewport/UA emulation, but run on Chromium for Linux host portability.
				// WebKit binaries frequently require distro-specific deps on non-Ubuntu runners.
				browserName: 'chromium',
			},
			testMatch: /mobile-smoke\.spec\.ts/,
		},
		{
			name: 'mobile-pixel-7',
			use: {
				...devices['Pixel 7'],
			},
			testMatch: /mobile-smoke\.spec\.ts/,
		},
	],
})
