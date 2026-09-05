import { expect, test, type Page } from '@playwright/test'

import { noFavoritesYetTitle } from '../src/lib/actionHints'
import { buildFavoritesFixture, installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './support/apiFixtures'
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
			handler: () => ({ json: buildFavoritesFixture({ bucket: defaultStorage.bucket, items: favorites }) }),
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

test('search errors remain distinct from empty results and keep cached matches', async ({ page }, testInfo) => {
	test.setTimeout(60_000)
	await page.setViewportSize({ width: 320, height: 568 })
	await seedStorage(page)
	await seedLocalStorage(page, { apiRetryCount: 0 })
	await setupApiMocks(page)
	let response: 'error' | 'empty' | 'match' | 'not_indexed' = 'error'
	await page.route('**/objects/search?**', route => route.fulfill({
		status: response === 'error' ? 503 : response === 'not_indexed' ? 409 : 200,
		contentType: 'application/json',
		body: JSON.stringify(response === 'error' || response === 'not_indexed'
			? { error: { code: response === 'error' ? 'unavailable' : 'not_indexed', message: 'Search unavailable' } }
			: { items: response === 'match' ? [{ key: 'alpha.txt', size: 12, lastModified: now }] : [], nextCursor: null }),
	}))
	await gotoWithDynamicImportRecovery(page, '/objects', scope => scope.getByPlaceholder('Search current folder'))
	const drawer = await openObjectsGlobalSearchDialog(page)
	await drawer.getByRole('textbox', { name: 'Search files or folders', exact: true }).fill('alpha')
	await expect(drawer.getByText('Search failed', { exact: true })).toBeVisible({ timeout: 15_000 })
	await expect(drawer.getByText('No results', { exact: true })).toHaveCount(0)
	await drawer.getByText('Search failed', { exact: true }).scrollIntoViewIfNeeded()
	await page.screenshot({ path: testInfo.outputPath('search-error-without-empty-result.png') })
	response = 'not_indexed'
	await drawer.getByRole('button', { name: /Refresh/ }).click()
	await expect(drawer.getByText('Search index needed', { exact: true })).toBeVisible({ timeout: 15_000 })
	await expect(drawer.getByText('No results', { exact: true })).toHaveCount(0)
	response = 'empty'
	await drawer.getByRole('button', { name: /Refresh/ }).click()
	await expect(drawer.getByText('No results', { exact: true })).toBeVisible()
	response = 'match'
	await drawer.getByRole('button', { name: /Refresh/ }).click()
	await expect(drawer.getByRole('button', { name: 'Open alpha.txt', exact: true })).toBeVisible()
	response = 'error'
	await drawer.getByRole('button', { name: /Refresh/ }).click()
	await expect(drawer.getByText('Search failed', { exact: true })).toBeVisible({ timeout: 15_000 })
	await expect(drawer.getByRole('button', { name: 'Open alpha.txt', exact: true })).toBeVisible()
})

for (const width of [320, 1440]) {
	test(`search range validation preserves inputs and labels at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: width === 320 ? 568 : 900 })
		await seedStorage(page)
		await setupApiMocks(page)
		const requests: URL[] = []
		page.on('request', (request) => {
			if (request.url().includes('/objects/search?')) requests.push(new URL(request.url()))
		})
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByRole('heading', { name: 'Objects', exact: true }))
		const drawer = await openObjectsGlobalSearchDialog(page)
		await drawer.getByRole('textbox', { name: 'Search files or folders', exact: true }).fill('alpha')
		await expect(drawer.getByText('1 result(s)', { exact: true })).toBeVisible()
		await drawer.getByRole('spinbutton', { name: 'Minimum size (MB)' }).fill('100')
		await drawer.getByRole('spinbutton', { name: 'Maximum size (MB)' }).click()
		await drawer.getByRole('spinbutton', { name: 'Maximum size (MB)' }).fill('1')
		await expect(drawer.getByRole('spinbutton', { name: 'Minimum size (MB)' })).toHaveValue('100')
		await expect(drawer.getByRole('spinbutton', { name: 'Maximum size (MB)' })).toHaveValue('1')
		await expect(drawer.getByRole('spinbutton', { name: 'Maximum size (MB)' })).toBeInViewport({ ratio: 1 })
		await expect(drawer.getByText('Minimum size must not exceed maximum size.')).toBeVisible()
		await expect(drawer.getByRole('button', { name: /Refresh/ })).toBeDisabled()
		await expect(drawer.getByText('1 result(s)', { exact: true })).toHaveCount(0)
		await drawer.getByRole('spinbutton', { name: 'Minimum size (MB)' }).fill('1')
		await expect(drawer.getByText('1 result(s)', { exact: true })).toBeVisible()
		await drawer.getByLabel('Modified after date', { exact: true }).fill('2026-09-06')
		await drawer.getByLabel('Modified before date', { exact: true }).click()
		await drawer.getByLabel('Modified before date', { exact: true }).fill('2026-09-01')
		await expect(drawer.getByText('Start date must not be after end date.')).toBeVisible()
		await expect(drawer.getByLabel('Modified before date', { exact: true })).toBeInViewport({ ratio: 1 })
		await expect(drawer.getByRole('button', { name: /Refresh/ })).toBeDisabled()
		await drawer.getByLabel('Modified before date', { exact: true }).fill('2026-09-06')
		await expect(drawer.getByText('1 result(s)', { exact: true })).toBeVisible()
		for (const name of ['Minimum size (MB)', 'Maximum size (MB)', 'Modified after date', 'Modified before date']) {
			await expect(drawer.locator('label').filter({ hasText: name })).toBeVisible()
		}
		await drawer.getByRole('button', { name: 'Reset', exact: true }).click()
		await expect(drawer.getByRole('spinbutton', { name: 'Minimum size (MB)' })).toHaveValue('')
		await expect(drawer.getByLabel('Modified after date', { exact: true })).toHaveValue('')
		expect(requests.length).toBeGreaterThan(0)
		for (const url of requests) {
			const min = url.searchParams.get('minSize'), max = url.searchParams.get('maxSize')
			if (min !== null && max !== null) expect(Number(min)).toBeLessThanOrEqual(Number(max))
			const after = url.searchParams.get('modifiedAfter'), before = url.searchParams.get('modifiedBefore')
			if (after && before) expect(Date.parse(after)).toBeLessThanOrEqual(Date.parse(before))
		}
	})
}
