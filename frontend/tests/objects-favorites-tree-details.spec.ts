import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	seedLocalStorage,
	textFixture,
} from './support/apiFixtures'
import { gotoObjectsPage, objectsFavoriteItem, objectsSelectionCheckbox, objectsTreeRow } from './support/ui'

const profileId = 'favorites-tree-profile'
const bucket = 'favorites-bucket'
const now = '2024-01-01T00:00:00Z'

const favoriteItems = [
	{
		key: 'docs/spec.md',
		size: 128,
		etag: '"spec"',
		lastModified: now,
		storageClass: 'STANDARD',
		createdAt: now,
	},
	{
		key: 'reports/2024/summary.txt',
		size: 256,
		etag: '"summary"',
		lastModified: now,
		storageClass: 'STANDARD',
		createdAt: now,
	},
]

const objectsByPrefix = {
	'': {
		commonPrefixes: ['docs/', 'reports/'],
		items: [],
	},
	'docs/': {
		commonPrefixes: [],
		items: [
			{ key: 'docs/spec.md', size: 128, lastModified: now, etag: '"spec"' },
			{ key: 'docs/guide.txt', size: 96, lastModified: now, etag: '"guide"' },
		],
	},
	'reports/2024/': {
		commonPrefixes: [],
		items: [{ key: 'reports/2024/summary.txt', size: 256, lastModified: now, etag: '"summary"' }],
	},
}

const metaByKey = {
	'docs/spec.md': {
		key: 'docs/spec.md',
		size: 128,
		etag: '"spec"',
		lastModified: now,
		contentType: 'text/markdown',
		metadata: { section: 'docs' },
	},
	'reports/2024/summary.txt': {
		key: 'reports/2024/summary.txt',
		size: 256,
		etag: '"summary"',
		lastModified: now,
		contentType: 'text/plain',
		metadata: { section: 'reports' },
	},
} as const

async function seedObjectsStorage(page: Page, overrides: Record<string, unknown> = {}) {
	await seedLocalStorage(page, {
		apiToken: 'favorites-token',
		profileId,
		bucket,
		prefix: '',
		objectsUIMode: 'advanced',
		objectsDetailsOpen: false,
		objectsFavoritesOpenDetails: true,
		objectsFavoritesPaneExpanded: true,
		...overrides,
	})
}

async function installObjectsFixtures(page: Page) {
	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: () => ({ json: buildMetaFixture() }),
		},
		{
			method: 'GET',
			path: '/api/v1/profiles',
			handler: () => ({
				json: [
					buildProfileFixture({
						id: profileId,
						name: 'Favorites Profile',
						createdAt: now,
						updatedAt: now,
					}),
				],
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/buckets',
			handler: () => ({ json: [buildBucketFixture(bucket, { createdAt: now })] }),
		},
		{
			method: 'GET',
			path: new RegExp(`/api/v1/buckets/${bucket}/objects(?:\\?.*)?$`),
			handler: ({ url }) => {
				const prefix = url.searchParams.get('prefix') ?? ''
				const pageFixture = objectsByPrefix[prefix as keyof typeof objectsByPrefix] ?? { commonPrefixes: [], items: [] }
				return {
					json: buildObjectsListFixture({
						bucket,
						prefix,
						commonPrefixes: pageFixture.commonPrefixes,
						items: pageFixture.items,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: ({ url }) => {
				const hydrate = url.searchParams.get('hydrate') === 'true'
				return {
					json: hydrate
						? { bucket, prefix: '', count: favoriteItems.length, hydrated: true, keys: favoriteItems.map((item) => item.key), items: favoriteItems }
						: { bucket, prefix: '', count: favoriteItems.length, hydrated: false, keys: favoriteItems.map((item) => item.key), items: [] },
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/meta`,
			handler: ({ url }) => {
				const key = url.searchParams.get('key') ?? ''
				const payload = metaByKey[key as keyof typeof metaByKey]
				if (!payload) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'object not found' } },
					}
				}
				return { json: payload }
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

test.describe('Objects favorites/tree/details sync', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize({ width: 1800, height: 1000 })
		await installObjectsFixtures(page)
	})

	test('favorite click in the same prefix selects the object and opens details', async ({ page }) => {
		await seedObjectsStorage(page, { prefix: 'docs/' })
		await gotoObjectsPage(page)

		await expect(page.getByText('Content Type')).toHaveCount(0)
		await objectsFavoriteItem(page, 'spec.md').click()

		await expect(page.getByText(`s3://${bucket}/docs/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'spec.md')).toBeChecked()
		await expect(page.getByText('Content Type')).toBeVisible()
		await expect(page.getByText('docs/spec.md')).toBeVisible()
	})

	test('favorite click in another prefix navigates and restores selection/details', async ({ page }) => {
		await seedObjectsStorage(page, { prefix: '' })
		await gotoObjectsPage(page)

		await objectsFavoriteItem(page, 'summary.txt').click()

		await expect(page.getByText(`s3://${bucket}/reports/2024/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'summary.txt')).toBeChecked()
		await expect(page.getByText('Content Type')).toBeVisible()
		await expect(page.getByText('reports/2024/summary.txt')).toBeVisible()
	})

	test('tree selection updates the active prefix and list results', async ({ page }) => {
		await seedObjectsStorage(page, { prefix: '' })
		await gotoObjectsPage(page)

		const rootRow = objectsTreeRow(page, 0).filter({ hasText: bucket }).first()
		await expect(rootRow).toBeVisible()
		await rootRow.getByRole('button', { name: `Expand ${bucket}` }).click()

		const docsRow = objectsTreeRow(page, 1).filter({ hasText: 'docs' }).first()
		await expect(docsRow).toBeVisible()
		await docsRow.getByRole('button', { name: 'docs', exact: true }).click()

		await expect(page.getByText(`s3://${bucket}/docs/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'spec.md')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'guide.txt')).toBeVisible()
	})
})
