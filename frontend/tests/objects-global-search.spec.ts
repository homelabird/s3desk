import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
import { dialogByName } from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
}

const now = '2024-01-01T00:00:00Z'

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

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, {
		...defaultStorage,
		...overrides,
		objectsUIMode: 'advanced',
		objectsAutoIndexEnabled: false,
	})
}

async function setupApiMocks(page: Page) {
	const objectItem = {
		key: 'alpha.txt',
		size: 12,
		lastModified: now,
	}
	let favorites = [] as Array<typeof objectItem & { createdAt: string }>

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson(metaResponse)),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: defaultStorage.profileId,
				name: 'Playwright',
				endpoint: 'http://minio:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: defaultStorage.bucket, createdAt: now }]),
		jsonFixture('GET', `/api/v1/buckets/${defaultStorage.bucket}/objects`, {
			bucket: defaultStorage.bucket,
			prefix: '',
			delimiter: '/',
			commonPrefixes: [],
			items: [objectItem],
			nextContinuationToken: null,
			isTruncated: false,
		}),
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: () => ({ json: { bucket: defaultStorage.bucket, prefix: '', items: favorites } }),
		},
		{
			method: 'POST',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: () => {
				const entry = { ...objectItem, createdAt: now }
				favorites = [entry]
				return { status: 201, json: entry }
			},
		},
		{
			method: 'DELETE',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: () => {
				favorites = []
				return { status: 204 }
			},
		},
		jsonFixture('GET', `/api/v1/buckets/${defaultStorage.bucket}/objects/search`, { items: [objectItem], nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test('global search and favorites update from objects UI', async ({ page }) => {
	await seedStorage(page)
	await setupApiMocks(page)

	await page.goto('/objects')
	await expect(page.getByPlaceholder('Search current folder')).toBeVisible()

	const objectRow = page.locator('[data-objects-row="true"]', { hasText: 'alpha.txt' }).first()
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Add favorite' }).click()
	await expect(objectRow.getByRole('button', { name: 'Remove favorite' })).toBeVisible()
	await expect(page.getByTestId('objects-favorite-item').filter({ hasText: 'alpha.txt' })).toBeVisible()

	const favoritesOnly = page.getByRole('switch', { name: 'Favorites only' }).first()
	await favoritesOnly.click()
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Remove favorite' }).click()
	await expect(page.getByText('No favorites yet.')).toBeVisible()

	await page.getByRole('button', { name: 'Global Search (Indexed)' }).click()
	const drawer = dialogByName(page, 'Global Search (Indexed)')
	await expect(drawer).toBeVisible()

	await drawer.getByPlaceholder('Search query (substring)').fill('alpha')
	await expect(drawer.getByText('alpha.txt')).toBeVisible({ timeout: 10_000 })
})
