import { expect, test, type Page } from '@playwright/test'

const metaResponse = {
	version: 'test',
	serverAddr: '127.0.0.1:8080',
	dataDir: '/data',
	staticDir: '/app/ui',
	apiTokenEnabled: true,
	encryptionEnabled: false,
	capabilities: { profileTls: { enabled: false, reason: 'test' } },
	jobConcurrency: 2,
	uploadSessionTTLSeconds: 3600,
	transferEngine: { name: 'rclone', available: true, path: '/usr/local/bin/rclone', version: 'v1.66.0' },
}

async function seedStorage(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.setItem('apiToken', JSON.stringify(''))
		window.localStorage.setItem('profileId', JSON.stringify(null))
	})
}

async function setupApiMocks(page: Page, validTokens: string[]) {
	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()
		const token = request.headers()['x-api-token'] ?? ''
		const isValidToken = validTokens.includes(token)

		if (method === 'GET' && path === '/api/v1/meta') {
			if (!isValidToken) {
				return route.fulfill({
					status: 401,
					contentType: 'application/json',
					body: JSON.stringify({ error: { code: 'unauthorized', message: 'invalid token' } }),
				})
			}
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(metaResponse) })
		}
		if (method === 'GET' && path === '/api/v1/profiles') {
			return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
		}
		if (method === 'GET' && path === '/api/v1/events') {
			return route.fulfill({ status: 403, contentType: 'text/plain', body: 'forbidden' })
		}

		return route.fulfill({
			status: 404,
			contentType: 'application/json',
			body: JSON.stringify({ error: { code: 'not_found', message: 'not found' } }),
		})
	})
}

async function setSwitch(page: Page, label: string, enabled: boolean) {
	const control = page.getByRole('switch', { name: label })
	const state = await control.getAttribute('aria-checked')
	if ((state === 'true') !== enabled) {
		await control.click()
	}
}

test('login gate and settings persist local state', async ({ page }) => {
	const validToken = 'valid-token'
	const updatedToken = 'updated-token'

	await seedStorage(page)
	await setupApiMocks(page, [validToken, updatedToken])

	await page.goto('/profiles')
	await expect(page.getByRole('heading', { name: 'S3Desk' })).toBeVisible()

	await page.getByLabel('API Token').fill(validToken)
	await page.getByRole('button', { name: 'Login' }).click()
	await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible({ timeout: 10_000 })

	await page.getByRole('button', { name: 'Settings' }).click()
	const drawer = page.locator('.ant-drawer').filter({ hasText: 'Settings' })
	await expect(drawer).toBeVisible()

	await drawer.getByLabel('Backend API Token (X-Api-Token)').fill(updatedToken)
	await drawer.getByRole('button', { name: 'Apply' }).click()
	const storedToken = await page.evaluate(() => JSON.parse(window.localStorage.getItem('apiToken') ?? '""'))
	expect(storedToken).toBe(updatedToken)

	await drawer.getByRole('tab', { name: 'Transfers' }).click()
	await setSwitch(page, 'Downloads: Use server proxy', true)
	const downloadProxy = await page.evaluate(() => JSON.parse(window.localStorage.getItem('downloadLinkProxyEnabled') ?? 'false'))
	expect(downloadProxy).toBe(true)
})
