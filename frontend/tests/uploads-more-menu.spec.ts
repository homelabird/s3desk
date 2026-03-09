import { expect, test } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'

const now = '2024-01-01T00:00:00Z'
const profileId = 'uploads-more-profile'
const bucket = 'uploads-more-bucket'

async function seedStorage(page: Parameters<typeof seedLocalStorage>[0]) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
	})
}

async function mockUploadsPageApi(page: Parameters<typeof installApiFixtures>[0]) {
	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
				allowedLocalDirs: [],
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadSessionTTLSeconds: 86400,
				uploadMaxBytes: null,
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				provider: 's3_compatible',
				name: 'Playwright',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: now }]),
		textFixture('GET', '/api/v1/events', '', { headers: { 'content-type': 'text/event-stream' } }),
	])
}

test.describe('Uploads header actions', () => {
	test('clears selected files from header action', async ({ page }) => {
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
		await page.getByRole('button', { name: 'Clear selection' }).click()

		await expect(page.getByRole('button', { name: /Queue upload/i })).toBeDisabled()
		await expect(page.getByText('No files selected.')).toBeVisible()
	})

	test('opens transfers drawer from header action', async ({ page }) => {
		await mockUploadsPageApi(page)
		await seedStorage(page)
		await page.goto('/uploads')

		await page.getByRole('button', { name: 'Open Transfers' }).click()

		const transfersDialog = page.getByRole('dialog', { name: /Transfers/i })
		await expect(transfersDialog).toBeVisible()
		await expect(transfersDialog.getByRole('tab', { name: /Uploads/i })).toHaveAttribute('aria-selected', 'true')
	})
})
