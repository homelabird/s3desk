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
} from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	apiRetryCount: number
	objectsSearch: string
	profileId: string
	bucket: string
	prefix: string
	objectsUIMode: 'simple' | 'advanced'
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	apiRetryCount: 0,
	objectsSearch: 'docs',
	profileId: 'playwright-prefix-profile',
	bucket: 'prefix-bucket',
	prefix: '',
	objectsUIMode: 'simple',
}

const now = '2024-01-01T00:00:00Z'

function buildDocsItems(start: number, count: number) {
	return Array.from({ length: count }, (_, index) => {
		const itemNumber = start + index
		const fileName = `todo-${String(itemNumber).padStart(4, '0')}.txt`
		return {
			key: `docs/${fileName}`,
			size: itemNumber,
			lastModified: now,
			etag: `"${fileName}"`,
		}
	})
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function waitForScopedPrefix(page: Page, expectedPrefix: string) {
	await page.waitForFunction(
		({ scope, prefix }) => JSON.parse(window.localStorage.getItem(`objects:${scope}:prefix`) ?? '""') === prefix,
		{ scope: defaultStorage.profileId, prefix: expectedPrefix },
	)
}

async function scrollAppContentToBottom(page: Page) {
	await page.locator('[data-scroll-container="app-content"]').evaluate((element) => {
		element.scrollTo({ top: element.scrollHeight })
	})
}

async function expectVisibleTodoRows(page: Page) {
	await expect
		.poll(async () => {
			const labels = await page
				.getByRole('checkbox')
				.evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? '').filter(Boolean))
			return labels.some((label) => /^Select todo-\d+\.txt$/.test(label))
		})
		.toBe(true)
}

async function installPrefixPaginationFixtures(page: Page) {
	const docsPageOne = buildDocsItems(1, 1000)
	const docsPageTwo = buildDocsItems(1001, 1)
	let docsPageTwoAttempts = 0

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
						name: 'Prefix Profile',
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
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects`,
			handler: (ctx) => {
				const prefix = ctx.url.searchParams.get('prefix') ?? ''
				const continuationToken = ctx.url.searchParams.get('continuationToken') ?? ''

				if (!prefix) {
					return {
						json: buildObjectsListFixture({
							bucket: defaultStorage.bucket,
							prefix,
							commonPrefixes: ['docs/'],
						}),
					}
				}

				if (prefix === 'docs/' && !continuationToken) {
					return {
						json: buildObjectsListFixture({
							bucket: defaultStorage.bucket,
							prefix,
							items: docsPageOne,
							nextContinuationToken: 'page-2',
							isTruncated: true,
						}),
					}
				}

				if (prefix === 'docs/' && continuationToken === 'page-2') {
					docsPageTwoAttempts += 1
					if (docsPageTwoAttempts <= 4) {
						return retryAfterErrorResponse(503, 'list_page_failed', 'temporary page failure', 0)
					}
					return {
						json: buildObjectsListFixture({
							bucket: defaultStorage.bucket,
							prefix,
							items: docsPageTwo,
						}),
					}
				}

				return {
					json: buildObjectsListFixture({
						bucket: defaultStorage.bucket,
						prefix,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${defaultStorage.bucket}/objects/favorites`,
			handler: (ctx) => ({
				json: buildFavoritesFixture({
					bucket: defaultStorage.bucket,
					prefix: ctx.url.searchParams.get('prefix') ?? '',
				}),
			}),
		},
	])
}

test('prefix navigation keeps its location while load-more failure recovers on retry', async ({ page }) => {
	await installPrefixPaginationFixtures(page)
	await seedStorage(page)

	await page.goto('/objects')

	const prefixRow = page.locator('[data-objects-row="true"]', { hasText: 'docs/' }).first()
	await expect(prefixRow).toBeVisible()
	await prefixRow.click()

	await waitForScopedPrefix(page, 'docs/')
	await expect(page.getByText('s3://prefix-bucket/docs/')).toBeVisible()
	await expect(page.getByRole('button', { name: 'docs/' })).toBeVisible()
	await expect(page.getByRole('checkbox', { name: 'Select todo-0001.txt' })).toBeVisible()
	await expect(page.getByPlaceholder('Search current folder')).toHaveValue('docs')
	await expect(page.getByText('Search paused at 1,000 items')).toBeVisible()

	const loadMoreButton = page.getByRole('button', { name: 'Load more results' })
	await scrollAppContentToBottom(page)
	await expect(loadMoreButton).toBeVisible()
	await loadMoreButton.click()

	const listError = page.getByRole('alert').filter({ hasText: 'Failed to list objects' })
	await expect(listError).toBeVisible({ timeout: 15_000 })
	await expect(listError).toContainText('temporary page failure')
	await waitForScopedPrefix(page, 'docs/')
	await expectVisibleTodoRows(page)

	await scrollAppContentToBottom(page)
	await loadMoreButton.click()

	await expect(page.getByRole('checkbox', { name: 'Select todo-1001.txt' })).toBeVisible()
	await expect(listError).toHaveCount(0)
	await waitForScopedPrefix(page, 'docs/')
})
