import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL || process.env.BASE_URL || 'http://127.0.0.1:8080'

export default defineConfig({
	testDir: './tests',
	timeout: 30_000,
	expect: { timeout: 5_000 },
	use: {
		baseURL,
		headless: true,
		viewport: { width: 1280, height: 720 },
	},
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
