import { expect, test, type Page } from '@playwright/test'

import { noFavoritesYetTitle } from '../src/lib/actionHints'
import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
import { dialogByName, gotoWithDynamicImportRecovery, objectsFavoriteItem, objectsListRow, openObjectsGlobalSearchDialog } from './support/ui'

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
		objectsFavoritesPaneExpanded: true,
		objectsAutoIndexEnabled: false,
	})
}

async function toggleFavoritesOnly(page: Page) {
	const inlineFavoritesOnly = page.getByRole('switch', { name: 'Favorites only' }).first()
	if (await inlineFavoritesOnly.isVisible().catch(() => false)) {
		await inlineFavoritesOnly.click()
		return
	}
	const inlineFavoritesOnlyCheckbox = page.getByRole('checkbox', { name: 'Favorites only' }).first()
	if (await inlineFavoritesOnlyCheckbox.isVisible().catch(() => false)) {
		await inlineFavoritesOnlyCheckbox.click()
		return
	}

	await page.getByRole('button', { name: /View|Filters/ }).click()
	const drawer = dialogByName(page, 'View options')
	await expect(drawer).toBeVisible()
	await drawer.getByRole('checkbox', { name: 'Favorites only' }).click()
	await drawer.getByRole('button', { name: 'Done' }).click()
	await expect(drawer).toHaveCount(0)
}

async function setupApiMocks(page: Page) {
	const objectItem = {
		key: 'alpha.txt',
		size: 12,
		lastModified: now,
	}
	let favorites = [] as Array<typeof objectItem & { createdAt: string }>
	let searchRequestCount = 0

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson(metaResponse)),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: defaultStorage.profileId,
				name: 'Playwright',
				provider: 's3_compatible',
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
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/search`,
			handler: () => {
				searchRequestCount += 1
				return { json: { items: [objectItem], nextCursor: null } }
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])

	return {
		getSearchRequestCount: () => searchRequestCount,
	}
}

test('global search and favorites update from objects UI', async ({ page }) => {
	test.setTimeout(90_000)
	await page.setViewportSize({ width: 1800, height: 1000 })
	await seedStorage(page)
	const apiState = await setupApiMocks(page)

	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
		timeout: 30_000,
		maxAttempts: 5,
	})

	const objectRow = objectsListRow(page, 'alpha.txt')
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Add favorite' }).click()
	await expect(objectRow.getByRole('button', { name: 'Remove favorite' })).toBeVisible()
	await expect(objectsFavoriteItem(page, 'alpha.txt')).toBeVisible()

	await toggleFavoritesOnly(page)
	await expect(objectRow).toBeVisible()

	await objectRow.getByRole('button', { name: 'Remove favorite' }).click()
	await expect(page.getByText(noFavoritesYetTitle())).toBeVisible()
	await toggleFavoritesOnly(page)
	await expect(objectRow).toBeVisible()

	const drawer = await openObjectsGlobalSearchDialog(page)

	await drawer.getByPlaceholder('Search files or folders').fill('alpha')
	await expect.poll(() => apiState.getSearchRequestCount(), { timeout: 15_000 }).toBeGreaterThan(0)
	await expect(drawer.getByText('alpha.txt')).toBeVisible({ timeout: 10_000 })
})
