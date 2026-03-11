import { expect, test, type Page } from '@playwright/test'

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
import { dialogByName } from './support/ui'

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
								items: [favoriteItem],
						  }
						: {
								bucket,
								prefix: '',
								count: 1,
								hydrated: false,
								keys: [favoriteItem.key],
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
	test('favoritesOnly surfaces a favorites error and recovers when the view is turned off', async ({ page }) => {
		await installFavoritesFailureFixtures(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.setViewportSize({ width: 1600, height: 900 })
		await page.goto('/objects')

		const favoritesAlert = page.getByRole('alert').filter({ hasText: 'Failed to load favorites' })
		await expect(favoritesAlert).toBeVisible({ timeout: 15_000 })
		await expect(favoritesAlert).toContainText('favorites backend unavailable')

		await page.getByRole('button', { name: 'View' }).click()
		const viewDrawer = dialogByName(page, 'View options')
		await expect(viewDrawer).toBeVisible()
		await viewDrawer.getByLabel('Favorites only').uncheck()
		await viewDrawer.getByRole('button', { name: 'Done' }).click()

		await expect(favoritesAlert).toHaveCount(0)
		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select beta.txt' })).toBeVisible()
	})

	test('global indexed search recovers from a transient error while favoritesOnly view stays stable', async ({ page }) => {
		await installSearchRecoveryFixtures(page)
		await seedStorage(page, { objectsFavoritesOnly: true })
		await page.setViewportSize({ width: 1600, height: 900 })
		await page.goto('/objects')

		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select beta.txt' })).toHaveCount(0)

		await page.getByRole('button', { name: 'Global Search (Indexed)' }).click()
		const drawer = dialogByName(page, 'Global Search (Indexed)')
		await expect(drawer).toBeVisible()

		await drawer.getByLabel('Search query').fill('error')
		const searchError = drawer.getByText('Search failed')
		await expect(searchError).toBeVisible({ timeout: 15_000 })
		await expect(drawer.getByText('index backend busy')).toBeVisible()

		await drawer.getByRole('button', { name: 'Refresh' }).click()
		await expect(drawer.getByText('logs/error.log')).toBeVisible()
		await expect(drawer.getByText('Search failed')).toHaveCount(0)

		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select beta.txt' })).toHaveCount(0)
	})
})
