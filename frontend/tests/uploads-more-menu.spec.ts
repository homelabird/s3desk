import { expect, test } from '@playwright/test'

import { addFilesOrFolderFirstSentenceHint } from '../src/lib/actionHints'
import { buildProfileFixture, installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
import { addUploadSourceFromDevice, gotoUploadsPage, openTransfersDialog } from './support/ui'

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
			buildProfileFixture({ id: profileId, name: 'Playwright' }),
			buildProfileFixture({ id: 'other-profile', name: 'Other profile' }),
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: bucket, createdAt: now }]),
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		textFixture('GET', '/api/v1/events', '', { headers: { 'content-type': 'text/event-stream' } }),
	])
}

test.describe('Uploads selection and destination actions', () => {
	for (const width of [320, 1440]) {
		test(`preserves drafts across navigation and labels replacement at ${width}px`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
			await mockUploadsPageApi(page)
			await seedStorage(page)
			await gotoUploadsPage(page)
			await addUploadSourceFromDevice(page, ['alpha.txt', 'beta.txt'].map(name => ({ name, mimeType: 'text/plain', buffer: Buffer.from(name) })))
			await page.getByLabel('Upload prefix (optional)').fill('draft/')
			await expect(page.getByRole('button', { name: 'Replace selection…' })).toBeVisible()
			await addUploadSourceFromDevice(page, [])
			await expect(page.getByRole('button', { name: 'Queue upload (2)' })).toBeEnabled()
			for (const route of ['Profiles', 'Uploads', 'Buckets', 'Uploads', 'Activity', 'Uploads']) {
				if (width === 320) await page.getByRole('button', { name: 'Open navigation', exact: true }).click()
				await page.getByRole('link', { name: route, exact: true }).click()
				await expect(page.getByRole('heading', { name: route, exact: true })).toBeVisible()
			}
			await expect(page.getByText('alpha.txt', { exact: true })).toBeVisible()
			await expect(page.getByText('beta.txt', { exact: true })).toBeVisible()
			await expect(page.getByLabel('Upload prefix (optional)')).toHaveValue('draft/')
			await addUploadSourceFromDevice(page, { name: 'gamma.txt', mimeType: 'text/plain', buffer: Buffer.from('gamma') })
			await expect(page.getByText('alpha.txt', { exact: true })).toHaveCount(0)
			await expect(page.getByText('gamma.txt', { exact: true })).toBeVisible()
			await expect(page.getByRole('button', { name: 'Queue upload (1)' })).toBeEnabled()
			await page.screenshot({ path: testInfo.outputPath('uploads-draft-restored-and-replaced.png') })
			await page.getByRole('combobox', { name: 'Profile', exact: true }).selectOption('other-profile')
			await expect(page.getByRole('button', { name: 'Add from device…' })).toBeVisible()
			await expect(page.getByText('gamma.txt', { exact: true })).toHaveCount(0)
		})
	}

	test('clears selected files from destination action', async ({ page }) => {
		await mockUploadsPageApi(page)
		await seedStorage(page)
		await gotoUploadsPage(page)

		await addUploadSourceFromDevice(page, {
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		await expect(page.getByRole('button', { name: /Queue upload \(1\)/i })).toBeEnabled()
		await page.getByRole('button', { name: 'Clear selection' }).click()

		await expect(page.getByRole('button', { name: /^Queue upload/ })).toHaveCount(0)
		await expect(page.getByText(addFilesOrFolderFirstSentenceHint())).toBeVisible()
	})

	test('opens transfers drawer from destination action', async ({ page }) => {
		await mockUploadsPageApi(page)
		await seedStorage(page)
		await gotoUploadsPage(page)
		await addUploadSourceFromDevice(page, {
			name: 'alpha.txt',
			mimeType: 'text/plain',
			buffer: Buffer.from('alpha'),
		})

		const transfersDialog = await openTransfersDialog(page, { triggerButtonName: 'Open Transfers', tabName: /Uploads/i })
		await expect(transfersDialog.getByRole('tab', { name: /Uploads/i })).toHaveAttribute('aria-selected', 'true')
	})
})
