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
		window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'))
		window.localStorage.setItem('profileId', JSON.stringify(null))
	})
}

async function setupApiMocks(page: Page) {
	await page.route('**/api/v1/**', async (route) => {
		const request = route.request()
		const url = new URL(request.url())
		const path = url.pathname
		const method = request.method()

		if (method === 'GET' && path === '/api/v1/meta') {
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

async function selectProvider(page: Page, optionLabel: string) {
	const combobox = page.getByRole('combobox', { name: 'Provider' })
	await combobox.click({ force: true })
	if ((await combobox.getAttribute('aria-expanded')) !== 'true') {
		await combobox.press('ArrowDown')
	}
	if ((await combobox.getAttribute('aria-expanded')) !== 'true') {
		const selector = combobox.locator('xpath=ancestor::*[contains(@class,"ant-select-selector")]')
		if (await selector.count()) {
			await selector.first().click({ force: true })
		}
	}
	await expect(combobox).toHaveAttribute('aria-expanded', 'true')
	const dropdown = page.locator('.ant-select-dropdown').filter({ hasText: optionLabel })
	await expect(dropdown).toBeVisible()
	await dropdown.getByText(optionLabel, { exact: true }).click()
}

test('profile provider forms toggle provider-specific fields', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/profiles')
	await page.getByRole('button', { name: 'New Profile' }).click()

	await expect(page.getByLabel('Endpoint URL')).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toBeVisible()
	await expect(page.getByLabel('Secret')).toBeVisible()

	await selectProvider(page, 'Azure Blob Storage')
	await expect(page.getByLabel('Storage Account Name')).toBeVisible()
	await expect(page.getByLabel('Account Key')).toBeVisible()
	await expect(page.getByLabel('Access Key ID')).toHaveCount(0)

	await selectProvider(page, 'Google Cloud Storage (GCS)')
	await expect(page.getByLabel('Service Account JSON')).toBeVisible()
	await page.getByRole('switch', { name: 'Anonymous' }).click()
	await expect(page.getByLabel('Service Account JSON')).toHaveCount(0)
	await expect(page.getByText('Anonymous mode does not use credentials.')).toBeVisible()

	await selectProvider(page, 'Oracle OCI Object Storage (Native)')
	await expect(page.getByLabel('Namespace')).toBeVisible()
	await expect(page.getByLabel('Compartment OCID')).toBeVisible()
	await expect(page.getByLabel('Storage Account Name')).toHaveCount(0)
})
