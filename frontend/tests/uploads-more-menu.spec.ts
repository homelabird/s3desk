import { expect, test, type Page } from '@playwright/test'

const now = '2024-01-01T00:00:00Z'
const profileId = 'uploads-more-profile'
const bucket = 'uploads-more-bucket'

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'))
		window.localStorage.setItem('profileId', JSON.stringify(seed.profileId))
		window.localStorage.setItem('bucket', JSON.stringify(seed.bucket))
	}, { profileId, bucket })
}

async function mockUploadsPageApi(page: Page) {
	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/meta') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					version: 'test',
					serverAddr: '127.0.0.1:8080',
					dataDir: '/tmp',
					staticDir: '/tmp',
					apiTokenEnabled: true,
					encryptionEnabled: false,
					capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
					allowedLocalDirs: [],
					jobConcurrency: 2,
					jobLogMaxBytes: null,
					jobRetentionSeconds: null,
					uploadSessionTTLSeconds: 86400,
					uploadMaxBytes: null,
					transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
				}),
			})
		}

		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([
					{
						id: profileId,
						provider: 's3',
						name: 'Playwright',
						endpoint: 'http://localhost:9000',
						region: 'us-east-1',
						forcePathStyle: true,
						tlsInsecureSkipVerify: true,
						createdAt: now,
						updatedAt: now,
					},
				]),
			})
		}

		if (method === 'GET' && path === '/api/v1/buckets') {
			return route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify([{ name: bucket, createdAt: now }]),
			})
		}

		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream' },
				body: '',
			})
		}

		return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
	})
}

test.describe('Uploads more menu', () => {
	test('clears selected files from more menu', async ({ page }) => {
		await mockUploadsPageApi(page)
		await seedStorage(page)
		await page.goto('/uploads')

		const input = page.locator('input[type="file"]').first()
		await input.setInputFiles({
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		await expect(page.getByRole('button', { name: /Queue upload \(1\)/i })).toBeEnabled()
		await page.getByRole('button', { name: 'More' }).click()
		await page.getByRole('menuitem', { name: 'Clear selected files' }).click()

		await expect(page.getByRole('button', { name: /Queue upload/i })).toBeDisabled()
		await expect(page.getByText('No files selected.')).toBeVisible()
	})

	test('opens transfers drawer from more menu', async ({ page }) => {
		await mockUploadsPageApi(page)
		await seedStorage(page)
		await page.goto('/uploads')

		await page.getByRole('button', { name: 'More' }).click()
		await page.getByRole('menuitem', { name: 'Open Transfers' }).click()

		const transfersDialog = page.getByRole('dialog', { name: /Transfers/i })
		await expect(transfersDialog).toBeVisible()
		await expect(transfersDialog.getByRole('tab', { name: /Uploads/i })).toHaveAttribute('aria-selected', 'true')
	})
})
