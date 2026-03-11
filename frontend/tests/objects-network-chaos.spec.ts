import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	retryAfterErrorResponse,
	seedLocalStorage,
	sequenceFixture,
	type ApiFixture,
	withDelay,
} from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	apiRetryCount: number
	profileId: string
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	apiRetryCount: 0,
	profileId: 'playwright-chaos-profile',
	bucket: 'chaos-bucket',
	objectsUIMode: 'advanced',
}

const now = '2024-01-01T00:00:00Z'
const objectItem = {
	key: 'notes/todo.txt',
	size: 128,
	lastModified: now,
	etag: '"todo"',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function getToolbarMoreButton(page: Page) {
	const byTestId = page.getByTestId('objects-toolbar-more')
	if (await byTestId.count()) return byTestId.first()
	return page.getByRole('button', { name: /More|Actions/i }).first()
}

function buildObjectsFixture(overrides?: Partial<ApiFixture>): ApiFixture {
	return {
		method: 'GET',
		path: `/api/v1/buckets/${defaultStorage.bucket}/objects`,
		handler: () => ({
			json: buildObjectsListFixture({
				bucket: defaultStorage.bucket,
				items: [objectItem],
			}),
		}),
		...overrides,
	}
}

async function installObjectsFixtures(page: Page, objectsFixture: ApiFixture) {
	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: () => ({
				json: buildMetaFixture({
					allowedLocalDirs: [],
					uploadDirectStream: false,
				}),
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/profiles',
			handler: () => ({
				json: [
					buildProfileFixture({
						id: defaultStorage.profileId,
						name: 'Chaos Profile',
						createdAt: now,
						updatedAt: now,
					}),
				],
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/buckets',
			handler: () => ({
				json: [buildBucketFixture(defaultStorage.bucket, { createdAt: now })],
			}),
		},
		objectsFixture,
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: () => ({
				json: buildFavoritesFixture({
					bucket: defaultStorage.bucket,
				}),
			}),
		},
	])
}

test.describe('Objects page network chaos', () => {
	test('keeps the shell interactive while the object list is delayed', async ({ page }) => {
		await installObjectsFixtures(page, withDelay(buildObjectsFixture(), 2_000))
		await seedStorage(page)

		const navigation = page.goto('/objects')

		await expect(page.getByPlaceholder('Search current folder')).toBeVisible()
		const rowCheckbox = page.getByRole('checkbox', { name: 'Select notes/todo.txt' })
		await expect(rowCheckbox).toHaveCount(0, { timeout: 250 })
		await expect(rowCheckbox).toBeVisible({ timeout: 10_000 })
		await navigation
	})

	test('recovers after a transient list failure when refresh is triggered', async ({ page }) => {
		const transientFailure = retryAfterErrorResponse(503, 'list_temporarily_unavailable', 'temporary outage', 0)
		await installObjectsFixtures(
			page,
			sequenceFixture('GET', `/api/v1/buckets/${defaultStorage.bucket}/objects`, [
				transientFailure,
				transientFailure,
				transientFailure,
				transientFailure,
				{
					json: buildObjectsListFixture({
						bucket: defaultStorage.bucket,
						items: [objectItem],
					}),
				},
			]),
		)
		await seedStorage(page)

		await page.goto('/objects')

		const listError = page.getByRole('alert').filter({ hasText: 'Failed to list objects' })
		await expect(listError).toBeVisible({ timeout: 15_000 })
		await expect(listError).toContainText('temporary outage')

		const moreButton = await getToolbarMoreButton(page)
		await moreButton.scrollIntoViewIfNeeded()
		await moreButton.click({ force: true })
		await page.getByRole('menuitem', { name: 'Refresh' }).click()

		await expect(page.getByRole('checkbox', { name: 'Select notes/todo.txt' })).toBeVisible()
	})
})
