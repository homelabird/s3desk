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

	test('favorite completion stays with its original profile after switching profiles', async ({ page }) => {
		const nextProfile = 'favorites-next-profile'
		const key = 'docs/guide.txt'
		const saved = new Map([[profileId, false], [nextProfile, false]])
		const mutations: Array<{ profile: string; key: string }> = []
		let completeMutation = () => {}
		const completion = new Promise<void>((resolve) => { completeMutation = resolve })
		await page.route('**/api/v1/profiles', (route) => route.fulfill({ json: [
			buildProfileFixture({ id: profileId, name: 'Favorites Profile' }),
			buildProfileFixture({ id: nextProfile, name: 'Next Profile' }),
		] }))
		await page.route(`**/api/v1/buckets/${bucket}/objects/favorites**`, async (route) => {
			const request = route.request()
			const profile = request.headers()['x-profile-id']
			if (request.method() === 'POST') {
				mutations.push({ profile, key: request.postDataJSON().key })
				await completion
				saved.set(profile, true)
				await route.fulfill({ json: { key, createdAt: now } })
				return
			}
			const hydrate = new URL(request.url()).searchParams.get('hydrate') === 'true'
			await route.fulfill({ json: {
				bucket, prefix: '', count: saved.get(profile) ? 1 : 0, hydrated: hydrate,
				keys: saved.get(profile) ? [key] : [],
				items: hydrate && saved.get(profile) ? [{ key, size: 96, lastModified: now, createdAt: now }] : [],
			} })
		})
		await seedObjectsStorage(page, {
			prefix: 'docs/',
			[`objects:favorites-token:${nextProfile}:bucket`]: bucket,
			[`objects:favorites-token:${nextProfile}:prefix`]: 'docs/',
		})
		await gotoObjectsPage(page)
		const profileSelect = page.getByTestId('topbar-profile-select').getByLabel('Profile')
		const addFavorite = page.getByRole('button', { name: 'Add favorite for guide.txt', exact: true })
		try {
			await expect(addFavorite).toBeEnabled()
			await addFavorite.click()
			await expect.poll(() => mutations).toEqual([{ profile: profileId, key }])
			await expect(addFavorite).toBeDisabled()
			await profileSelect.selectOption(nextProfile)
			await expect(profileSelect).toHaveValue(nextProfile)
			await expect(addFavorite).toBeEnabled()
			completeMutation()
			await expect.poll(() => saved.get(profileId)).toBe(true)
			await expect(addFavorite).toBeEnabled()
			expect(saved.get(nextProfile)).toBe(false)
			await profileSelect.selectOption(profileId)
			await expect(page.getByRole('button', { name: 'Remove favorite for guide.txt', exact: true })).toBeEnabled()
			expect(mutations).toEqual([{ profile: profileId, key }])
		} finally {
			completeMutation()
		}
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

	test('keeps expanded descendants usable after creating a sibling folder', async ({ page }) => {
		let created = false
		await page.route(`**/api/v1/buckets/${bucket}/objects/folder`, (route) => {
			expect(route.request().postDataJSON()).toEqual({ key: 'new-folder/' })
			created = true
			return route.fulfill({ json: { key: 'new-folder/' } })
		})
		await page.route(`**/api/v1/buckets/${bucket}/objects?*`, (route) => {
			const prefix = new URL(route.request().url()).searchParams.get('prefix') ?? ''
			return route.fulfill({ json: buildObjectsListFixture({
				bucket, prefix,
				commonPrefixes: prefix === ''
					? ['docs/', ...(created ? ['new-folder/'] : [])]
					: prefix === 'docs/' ? ['docs/nested/'] : [],
			}) })
		})
		await seedObjectsStorage(page, {
			[`objects:favorites-token:${profileId}:treeExpandedByBucket`]: { [bucket]: ['/', 'docs/'] },
		})
		await gotoObjectsPage(page)
		const nestedFolder = page.getByRole('treeitem', { name: 'nested', exact: true })
		await expect(nestedFolder).toBeVisible()

		await page.getByTestId('objects-tree-new-folder').click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await dialog.getByLabel('Folder name').fill('new-folder')
		await dialog.getByRole('button', { name: 'Create folder' }).click()
		await expect(dialog).toHaveCount(0)
		await expect(page.getByRole('treeitem', { name: 'new-folder', exact: true })).toBeVisible()
		await expect(nestedFolder).toBeVisible()
		await nestedFolder.getByRole('button', { name: 'nested', exact: true }).click()
		await expect(page.getByText(`s3://${bucket}/docs/nested/`)).toBeVisible()
	})

	test('shows a new folder when creation overlaps an older tree request', async ({ page }) => {
		let releaseFirstListing!: () => void
		const firstListing = new Promise<void>((resolve) => { releaseFirstListing = resolve })
		let treeRequests = 0
		let created = false
		await page.route(`**/api/v1/buckets/${bucket}/objects/folder`, (route) => {
			created = true
			return route.fulfill({ json: { key: 'new-folder/' } })
		})
		await page.route(`**/api/v1/buckets/${bucket}/objects?*`, async (route) => {
			const url = new URL(route.request().url())
			const commonPrefixes = created ? ['docs/', 'new-folder/'] : ['docs/']
			if (url.searchParams.get('prefixesOnly') === 'true' && ++treeRequests === 1) await firstListing
			return route.fulfill({ json: buildObjectsListFixture({ bucket, commonPrefixes }) })
		})
		await seedObjectsStorage(page, {
			[`objects:favorites-token:${profileId}:treeExpandedByBucket`]: { [bucket]: ['/'] },
		})
		try {
			await gotoObjectsPage(page)
			await expect(page.getByRole('treeitem', { name: bucket })).toHaveAttribute('aria-busy', 'true')
			await page.getByTestId('objects-tree-new-folder').click()
			const dialog = page.getByRole('dialog', { name: 'New folder' })
			await dialog.getByLabel('Folder name').fill('new-folder')
			await dialog.getByRole('button', { name: 'Create folder' }).click()
			await expect(dialog).toHaveCount(0)
			await expect(page.locator('#a11y-status')).toContainText('Folder created')
			releaseFirstListing()
			await expect(page.getByRole('treeitem', { name: 'new-folder', exact: true })).toBeVisible()
			expect(treeRequests).toBe(2)
		} finally {
			releaseFirstListing()
		}
	})
})
