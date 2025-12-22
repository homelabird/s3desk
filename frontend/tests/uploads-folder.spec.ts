import path from 'path'
import { fileURLToPath } from 'url'

import { expect, test, type Page } from '@playwright/test'

const testDir = path.dirname(fileURLToPath(import.meta.url))
const fixtureRoot = path.join(testDir, 'fixtures', 'upload-folder')

function seedStorage(page: Page) {
	return page.addInitScript(() => {
		window.localStorage.setItem('apiToken', JSON.stringify('playwright-token'))
		window.localStorage.setItem('profileId', JSON.stringify('playwright-profile'))
		window.localStorage.setItem('bucket', JSON.stringify('test-bucket'))
	})
}

test('folder upload preserves relative paths', async ({ page }) => {
	await page.route('**/api/v1/profiles', async (route) => {
		await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([]) })
	})
	await page.route('**/api/v1/buckets', async (route) => {
		await route.fulfill({
			status: 200,
			contentType: 'application/json',
			body: JSON.stringify([{ name: 'test-bucket', createdAt: '2024-01-01T00:00:00Z' }]),
		})
	})
	await page.route('**/api/v1/uploads', async (route) => {
		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({ uploadId: 'upload-test', maxBytes: null, expiresAt: '2025-01-01T00:00:00Z' }),
		})
	})

	let uploadBody = ''
	await page.route('**/api/v1/uploads/**/files', async (route) => {
		const buffer = route.request().postDataBuffer()
		uploadBody = buffer ? buffer.toString('utf8') : ''
		await route.fulfill({ status: 204 })
	})
	await page.route('**/api/v1/uploads/**/commit', async (route) => {
		await route.fulfill({
			status: 201,
			contentType: 'application/json',
			body: JSON.stringify({ jobId: 'job-test' }),
		})
	})

	await seedStorage(page)
	await page.goto('/uploads')

	const folderSwitch = page.getByRole('switch').first()
	if ((await folderSwitch.getAttribute('aria-checked')) !== 'true') {
		await folderSwitch.click()
	}

	const input = page.locator('input[type="file"]').first()
	await input.setInputFiles(fixtureRoot)

	const queueButton = page.getByRole('button', { name: /Queue upload/i })
	await expect(queueButton).toBeEnabled()
	await queueButton.click()

	await expect.poll(() => uploadBody, { timeout: 5000 }).not.toBe('')
	expect(uploadBody).toMatch(/filename="[^"]*dir-a\/alpha\.txt"/)
	expect(uploadBody).toMatch(/filename="[^"]*dir-b\/nested\/beta\.txt"/)
})
