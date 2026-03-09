import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'

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
	return page.getByRole('button', { name: /More|Actions/i }).first()
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

test.describe('Objects page smoke', () => {
	test('simple mode hides advanced controls', async ({ page }) => {
		await stubObjectsSmokeApi(page, { objectsUIMode: 'simple' })
		await seedStorage(page, { objectsUIMode: 'simple' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toBeVisible()

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Advanced mode/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toHaveCount(0)
	})

	test('advanced mode shows advanced controls', async ({ page }) => {
		await stubObjectsSmokeApi(page, { objectsUIMode: 'advanced' })
		await seedStorage(page, { objectsUIMode: 'advanced' })
		await page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		await expect(page.getByLabel('Go to path')).toBeVisible()

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await expect(page.getByRole('menuitem', { name: /Simple mode/i })).toBeVisible()
		await expect(page.getByRole('menuitem', { name: /Global search/i })).toBeVisible()
	})
})
