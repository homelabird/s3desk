import { expect, test, type Page } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'
const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(null))
	}, { apiToken })
}

test.describe('Live server migration flow', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('downloads a backup bundle and stages a restore bundle from the UI', async ({ page }, testInfo) => {
		test.setTimeout(180_000)

		await seedStorage(page)
		await page.goto('/profiles')
		await page.getByRole('link', { name: 'Settings' }).click()

		const drawer = page.getByRole('dialog', { name: 'Settings' })
		await expect(drawer).toBeVisible()
		await drawer.getByRole('tab', { name: 'Server' }).click()
		await expect(drawer.getByRole('button', { name: 'Download backup' })).toBeVisible({ timeout: 30_000 })

		const downloadPromise = page.waitForEvent('download')
		await drawer.getByRole('button', { name: 'Download backup' }).click()
		const download = await downloadPromise
		const archivePath = testInfo.outputPath(download.suggestedFilename() || 's3desk-backup.tar.gz')
		await download.saveAs(archivePath)

		const restoreInput = drawer.locator('input[type="file"]').first()
		await restoreInput.setInputFiles(archivePath)

		await expect(drawer.getByText('Restore bundle staged')).toBeVisible({ timeout: 30_000 })
		await expect(drawer.getByText(/staging directory/i)).toBeVisible()
		await expect(drawer.getByText(/next steps/i)).toBeVisible()
	})
})
