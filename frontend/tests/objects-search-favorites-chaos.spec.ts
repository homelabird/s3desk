import { expect, test, type Page } from '@playwright/test'

import { expectMinTouchTarget } from './support/geometry'
import { failedToLoadFavoritesTitle } from '../src/lib/actionHints'
import {
	buildBucketFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	retryAfterErrorResponse,
	seedLocalStorage,
	sequenceFixture,
	textFixture,
} from './support/apiFixtures'
import { dialogByName, gotoObjectsPage, objectsSelectionCheckbox, openObjectsGlobalSearchDialog } from './support/ui'

const profileId = 'playwright-search-chaos-profile'
const bucket = 'search-chaos-bucket'
const now = '2024-01-01T00:00:00Z'

const rootObjects = [
	{ key: 'alpha.txt', size: 12, lastModified: now, etag: '"alpha"' },
	{ key: 'beta.txt', size: 24, lastModified: now, etag: '"beta"' },
]

const favoriteItem = {
	key: 'alpha.txt',
	size: 12,
	etag: '"alpha"',
	lastModified: now,
	storageClass: 'STANDARD',
	createdAt: now,
}

async function seedStorage(page: Page, overrides: Record<string, unknown> = {}) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		apiRetryCount: 0,
		profileId,
		bucket,
		prefix: '',
		objectsUIMode: 'advanced',
		objectsFavoritesPaneExpanded: true,
		...overrides,
	})
}

async function installFavoritesFailureFixtures(page: Page) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', buildMetaFixture()),
		jsonFixture('GET', '/api/v1/profiles', [
			buildProfileFixture({
				id: profileId,
				name: 'Search Chaos Profile',
				createdAt: now,
				updatedAt: now,
			}),
		]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture(bucket, { createdAt: now })]),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects`, buildObjectsListFixture({ bucket, items: rootObjects })),
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: () => retryAfterErrorResponse(503, 'favorites_unavailable', 'favorites backend unavailable', 0),
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function installSearchRecoveryFixtures(page: Page) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', buildMetaFixture()),
		jsonFixture('GET', '/api/v1/profiles', [
			buildProfileFixture({
				id: profileId,
				name: 'Search Chaos Profile',
				createdAt: now,
				updatedAt: now,
			}),
		]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture(bucket, { createdAt: now })]),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects`, buildObjectsListFixture({ bucket, items: rootObjects })),
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: ({ url }) => {
				const hydrate = url.searchParams.get('hydrate') === 'true'
				return {
					json: hydrate
						? {
								bucket,
								prefix: '',
								count: 1,
								hydrated: true,
								keys: [favoriteItem.key],
								items: [favoriteItem],
						  }
						: {
								bucket,
								prefix: '',
								count: 1,
								hydrated: false,
								keys: [favoriteItem.key],
								items: [],
						  },
				}
			},
		},
		sequenceFixture('GET', `/api/v1/buckets/${bucket}/objects/search`, [
			retryAfterErrorResponse(503, 'search_backend_busy', 'index backend busy', 0),
			retryAfterErrorResponse(503, 'search_backend_busy', 'index backend busy', 0),
			retryAfterErrorResponse(503, 'search_backend_busy', 'index backend busy', 0),
			retryAfterErrorResponse(503, 'search_backend_busy', 'index backend busy', 0),
			{
				json: {
					items: [
						{
							key: 'logs/error.log',
							size: 321,
							lastModified: now,
							etag: '"error"',
						},
					],
					nextCursor: null,
				},
			},
		]),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test.describe('Objects global search and favorites chaos', () => {
	test('favoritesOnly retries an initial failure and can return to unfiltered objects', async ({ page }) => {
		test.setTimeout(45_000)
		await installFavoritesFailureFixtures(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.setViewportSize({ width: 1600, height: 900 })
		await gotoObjectsPage(page)

		const favoritesPaneStatus = page.getByTestId('objects-favorites-status')
		const favoritesAlerts = page.getByRole('alert').filter({ hasText: failedToLoadFavoritesTitle() })
		await expect(favoritesPaneStatus).toHaveAttribute('data-favorites-status-kind', 'error', { timeout: 15_000 })
		await expect(favoritesPaneStatus).toContainText(failedToLoadFavoritesTitle())
		await expect(favoritesPaneStatus).toContainText('favorites backend unavailable')
		await expect(favoritesAlerts).toHaveCount(3)
		await page.route(`**/api/v1/buckets/${bucket}/objects/favorites**`, (route) => route.fulfill({
			json: { bucket, prefix: '', count: 1, hydrated: true, keys: [favoriteItem.key], items: [favoriteItem] },
		}))
		await page.getByRole('button', { name: 'Retry favorites' }).click()
		await expect(favoritesAlerts).toHaveCount(0)
		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'beta.txt')).toHaveCount(0)

		await page.getByRole('button', { name: 'Filters' }).click()
		const viewDrawer = dialogByName(page, 'View options')
		await expect(viewDrawer).toBeVisible({ timeout: 15_000 })
		await viewDrawer.getByLabel('Favorites only').uncheck()
		await viewDrawer.getByRole('button', { name: 'Done' }).click()

		await expect(favoritesAlerts).toHaveCount(0)
		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'beta.txt')).toBeVisible()
	})

	for (const width of [1600, 390]) {
		test(`favorites retry preserves cached items and filters at ${width}px`, async ({ page }, testInfo) => {
			await installSearchRecoveryFixtures(page)
			let fail = false
			let holdRetry = false
			let hydratedRequests = 0
			let finishRetry!: () => void
			const retryGate = new Promise<void>((resolve) => { finishRetry = resolve })
			await page.route(`**/api/v1/buckets/${bucket}/objects/favorites**`, async (route) => {
				const hydrate = new URL(route.request().url()).searchParams.get('hydrate') === 'true'
				if (hydrate) {
					hydratedRequests += 1
					if (holdRetry) await retryGate
					if (fail) return route.fulfill({ status: 503, json: { error: { code: 'favorites_unavailable', message: 'favorites backend unavailable' } } })
				}
				return route.fulfill({ json: { bucket, prefix: '', count: 1, hydrated: hydrate, keys: [favoriteItem.key], items: hydrate ? [favoriteItem] : [] } })
			})
			await seedStorage(page, { objectsFavoritesOnly: true })
			await page.setViewportSize({ width, height: 900 })
			await gotoObjectsPage(page)
			const openFavorites = async () => {
				if (width < 1000) {
					await page.getByRole('button', { name: 'More actions', exact: true }).click()
					await page.getByRole('menuitem', { name: 'Folders' }).click()
				}
			}
			await openFavorites()
			const pane = page.getByTestId('objects-favorites-pane')
			await expect(pane.getByTestId('objects-favorite-item')).toBeVisible()
			await pane.getByRole('textbox', { name: 'Find favorite' }).fill('alpha')
			if (width < 1000) await page.getByRole('dialog', { name: 'Browse' }).getByRole('button', { name: 'Close', exact: true }).click()
			fail = true
			await page.getByTestId('objects-toolbar-more').click()
			await page.getByRole('menuitem', { name: 'Refresh' }).click()
			await openFavorites()
			await expect(pane.getByTestId('objects-favorites-status')).toContainText('favorites backend unavailable')
			await expect(pane.getByTestId('objects-favorite-item')).toBeVisible()
			const requestsBeforeRetry = hydratedRequests
			fail = false
			holdRetry = true
			const retry = pane.getByRole('button', { name: 'Retry favorites' })
			await page.screenshot({ path: testInfo.outputPath('favorites-retry.png') })
			if (width < 1000) await expectMinTouchTarget(retry)
			try {
				await retry.click()
				await expect(retry).toBeDisabled()
				await expect(pane.getByRole('textbox', { name: 'Find favorite' })).toHaveValue('alpha')
				await expect(pane.getByTestId('objects-favorite-item')).toBeVisible()
			} finally {
				finishRetry()
			}
			await expect(pane.getByTestId('objects-favorites-status')).toHaveCount(0)
			await expect(retry).toHaveCount(0)
			expect(hydratedRequests).toBe(requestsBeforeRetry + 1)
			await expect(pane.getByRole('switch', { name: 'Favorites only' })).toBeChecked()
			await page.screenshot({ path: testInfo.outputPath('favorites-recovered.png') })
			if (width < 1000) await page.getByRole('dialog', { name: 'Browse' }).getByRole('button', { name: 'Close', exact: true }).click()
			await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeVisible()
			await expect(objectsSelectionCheckbox(page, 'beta.txt')).toHaveCount(0)
		})
	}

	test('all-folder search recovers from a transient error while favoritesOnly view stays stable', async ({ page }) => {
		test.setTimeout(90_000)
		await installSearchRecoveryFixtures(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.setViewportSize({ width: 1600, height: 900 })
		await gotoObjectsPage(page, { timeout: 30_000 })

		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'beta.txt')).toHaveCount(0)

		const drawer = await openObjectsGlobalSearchDialog(page)

		await drawer.getByLabel('Search files or folders').fill('error')
		const searchError = drawer.getByText('Search failed')
		await expect(searchError).toBeVisible({ timeout: 15_000 })
		await expect(drawer.getByText('index backend busy')).toBeVisible()

		await drawer.getByRole('button', { name: 'Refresh' }).click()
		await expect(drawer.getByText('logs/error.log')).toBeVisible({ timeout: 30_000 })
		await expect(drawer.getByText('Search failed')).toHaveCount(0)

		await expect(objectsSelectionCheckbox(page, 'alpha.txt')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'beta.txt')).toHaveCount(0)
	})
})
