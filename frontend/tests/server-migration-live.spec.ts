import { expect, test, type Page } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'
const apiToken = process.env.E2E_API_TOKEN ?? 'change-me'
const backupPassword = process.env.E2E_BACKUP_PASSWORD ?? 'operator-secret'

async function seedStorage(page: Page) {
	await page.addInitScript((seed) => {
		window.localStorage.setItem('apiToken', JSON.stringify(seed.apiToken))
		window.localStorage.setItem('profileId', JSON.stringify(null))
	}, { apiToken })
}

test.describe('Live server migration flow', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('downloads a password-protected backup bundle and stages a restore with the same password', async ({ page }, testInfo) => {
		test.setTimeout(180_000)

		await seedStorage(page)
		await page.goto('/profiles')

		await page.getByRole('button', { name: 'Backup' }).click()
		const drawer = page.getByRole('dialog', { name: 'Backup and restore' })
		await expect(drawer).toBeVisible({ timeout: 30_000 })
		await expect(drawer.getByRole('button', { name: 'Download backup' })).toBeVisible()

		const downloadPromise = page.waitForEvent('download')
		await drawer.getByText('Protect with password').click()
		await drawer.getByPlaceholder('Backup password', { exact: true }).fill(backupPassword)
		await drawer.getByPlaceholder('Confirm backup password', { exact: true }).fill(backupPassword)
		await drawer.getByRole('button', { name: 'Download backup' }).click()
		const download = await downloadPromise
		const archivePath = testInfo.outputPath(download.suggestedFilename() || 's3desk-full-backup-encrypted.tar.gz')
		await download.saveAs(archivePath)

		await drawer.getByPlaceholder('Bundle password (optional)', { exact: true }).fill(backupPassword)

		const restoreInput = drawer.getByTestId('sidebar-restore-input')
		await restoreInput.setInputFiles(archivePath)

		await expect(drawer.getByText('Latest staged restore')).toBeVisible({ timeout: 30_000 })
		await expect(drawer.getByText(/full \/ sqlite \/ encrypted/i)).toBeVisible({ timeout: 30_000 })
		await expect(drawer.getByText(/checksum/i)).toBeVisible()
		await expect(drawer.getByText(/payload decrypted/i)).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Copy staging path' })).toBeVisible()
	})
})
