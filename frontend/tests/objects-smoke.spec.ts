import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'
import { gotoWithDynamicImportRecovery } from './support/ui'

type StorageSeed = {
	objectsUIMode: 'simple' | 'advanced'
	apiToken: string
	profileId: string | null
	bucket: string
}

const defaultStorage: StorageSeed = {
	objectsUIMode: 'advanced',
	apiToken: 'change-me',
	profileId: 'playwright-smoke',
	bucket: 'test-bucket',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function getToolbarMoreButton(page: Page) {
	const byTestId = page.getByTestId('objects-toolbar-more')
	if (await byTestId.count()) return byTestId.first()
	return page.getByRole('button', { name: /Object tools|More actions|Tools|Actions/i }).first()
}

async function stubObjectsSmokeApi(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }
	const now = '2024-01-01T00:00:00Z'

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadMaxBytes: null,
				allowedLocalDirs: [],
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: seed.profileId,
				name: 'Playwright',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: seed.bucket, createdAt: now }]),
		jsonFixture('GET', `/api/v1/buckets/${seed.bucket}/objects`, {
			bucket: seed.bucket,
			prefix: '',
			delimiter: '/',
			commonPrefixes: [],
			items: [],
			nextContinuationToken: null,
			isTruncated: false,
		}),
		jsonFixture('GET', `/api/v1/buckets/${seed.bucket}/objects/favorites`, {
			bucket: seed.bucket,
			prefix: '',
			items: [],
		}),
	])
}

test.describe('@check-smoke Objects page smoke', () => {
	test('boots in focused mode and persists workspace tools toggle to local storage', async ({ page }) => {
		await stubObjectsSmokeApi(page, { objectsUIMode: 'simple' })
		await seedStorage(page, { objectsUIMode: 'simple' })
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
			timeout: 10_000,
			maxAttempts: 3,
		})

		const controls = page.getByTestId('objects-list-controls-root')
		await expect(controls).toBeVisible({ timeout: 10_000 })
		await expect(controls.getByLabel('Search current folder')).toBeVisible({ timeout: 10_000 })
		await expect(controls.getByLabel('Go to path')).toHaveCount(0)

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await expect(moreButton).toBeVisible()
		await expect(moreButton).toBeEnabled()
		await moreButton.click()
		const showWorkspaceTools = page.getByRole('menuitem', { name: /Show workspace tools/i })
		await expect(showWorkspaceTools).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Search bucket/i })).toHaveCount(0)
		await showWorkspaceTools.click()

		await expect(moreButton).toBeVisible()
		await expect(moreButton).toBeEnabled()
		await moreButton.click()
		await expect(page.getByRole('menuitem', { name: /Hide workspace tools/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Search bucket/i })).toHaveCount(0)
		await expect(page.getByRole('button', { name: /Search bucket/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Go to path/i })).toBeVisible()
		await expect
			.poll(() => page.evaluate(() => window.localStorage.getItem('objectsUIMode')))
			.toBe(JSON.stringify('advanced'))
	})
})
