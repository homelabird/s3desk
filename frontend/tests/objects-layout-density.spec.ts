import { expect, test, type Locator, type Page } from '@playwright/test'

import {
	clearFavoritesFilterHint,
	createFolderOrUploadFilesAtThisLevelHint,
	failedToLoadFoldersTitle,
	noFoldersHereYetTitle,
	noFavoritesMatchQueryTitle,
	pickBucketToBrowseFoldersAndNestedPrefixesHint,
	selectBucketFirstHint,
} from '../src/lib/actionHints'
import {
	buildBucketFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	seedLocalStorage,
	textFixture,
} from './support/apiFixtures'
import {
	objectsBucketPickerDesktop,
	objectsFavoriteItem,
	objectsFavoritesControls,
	objectsGlobalSearchTableWrap,
	objectsTreeStatus,
	gotoWithDynamicImportRecovery,
	objectsSelectionCheckbox,
	objectsTreeRow,
} from './support/ui'

const profileId = 'layout-profile'
const bucket = 'layout-bucket'
const longBucket = 'layout-bucket-regional-observability-archive-2026'
const now = '2024-01-01T00:00:00Z'
const availableBuckets = [bucket, longBucket]

const objectsByPrefix = {
	'': {
		commonPrefixes: ['reports/'],
		items: [],
	},
	'reports/': {
		commonPrefixes: ['reports/2024/'],
		items: [{ key: 'reports/quarterly.csv', size: 64, lastModified: now, etag: '"quarterly"' }],
	},
	'reports/2024/': {
		commonPrefixes: [],
		items: [{ key: 'reports/2024/summary.txt', size: 128, lastModified: now, etag: '"summary"' }],
	},
} as const

const favoriteItems = [
	{
		key: 'reports/2024/summary.txt',
		size: 128,
		etag: '"summary"',
		lastModified: now,
		storageClass: 'STANDARD',
		createdAt: now,
	},
]

function buildSearchCapItems(count: number) {
	return Array.from({ length: count }, (_, index) => {
		const itemNumber = index + 1
		const fileName = `search-log-${String(itemNumber).padStart(4, '0')}.txt`
		return {
			key: fileName,
			size: itemNumber,
			lastModified: now,
			etag: `"${fileName}"`,
		}
	})
}

async function expectMinTouchHeight(locator: Locator, minHeight = 44) {
	const box = await locator.boundingBox() // e2e-geometry-allow validates public touch-target height contract
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(minHeight)
}

const metaByKey = {
	'reports/2024/summary.txt': {
		key: 'reports/2024/summary.txt',
		size: 128,
		etag: '"summary"',
		lastModified: now,
		contentType: 'text/plain',
		metadata: { suite: 'adaptive-desktop' },
	},
} as const

async function stubObjectsAdaptiveApi(
	page: Page,
	options: {
		rootObjects?: {
			commonPrefixes?: string[]
			items?: Array<{ key: string; size: number; lastModified: string; etag: string }>
			nextContinuationToken?: string | null
			isTruncated?: boolean
		}
		globalSearchItems?: Array<{ key: string; size?: number; lastModified?: string }>
		prefixErrors?: Record<string, string>
	} = {},
) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', buildMetaFixture()),
		jsonFixture('GET', '/api/v1/profiles', [buildProfileFixture({ id: profileId })]),
		jsonFixture('GET', '/api/v1/buckets', availableBuckets.map((name) => buildBucketFixture(name))),
		{
			method: 'GET',
			path: /\/api\/v1\/buckets\/[^/]+\/objects(?:\?.*)?$/,
			handler: ({ url }) => {
				const bucketName = url.pathname.match(/^\/api\/v1\/buckets\/([^/]+)\/objects$/)?.[1] ?? ''
				if (!availableBuckets.includes(bucketName)) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'bucket not found' } },
					}
				}
				const prefix = url.searchParams.get('prefix') ?? ''
				const prefixErrorMessage = options.prefixErrors?.[prefix]
				if (prefixErrorMessage) {
					return {
						status: 500,
						json: { error: { code: 'prefix_scan_failed', message: prefixErrorMessage } },
					}
				}
				const fixture =
					prefix === '' && options.rootObjects
						? {
								commonPrefixes: options.rootObjects.commonPrefixes ?? [],
								items: options.rootObjects.items ?? [],
								nextContinuationToken: options.rootObjects.nextContinuationToken ?? null,
								isTruncated: options.rootObjects.isTruncated ?? false,
							}
						: objectsByPrefix[prefix as keyof typeof objectsByPrefix] ?? { commonPrefixes: [], items: [] }
				return {
					json: buildObjectsListFixture({
						bucket: bucketName,
						prefix,
						commonPrefixes: fixture.commonPrefixes,
						items: fixture.items,
						nextContinuationToken: fixture.nextContinuationToken,
						isTruncated: fixture.isTruncated,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: /\/api\/v1\/buckets\/[^/]+\/objects\/favorites$/,
			handler: ({ url }) => {
				const bucketName = url.pathname.match(/^\/api\/v1\/buckets\/([^/]+)\/objects\/favorites$/)?.[1] ?? ''
				if (!availableBuckets.includes(bucketName)) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'bucket not found' } },
					}
				}
				const hydrate = url.searchParams.get('hydrate') === 'true'
				return {
					json: hydrate
						? { bucket: bucketName, prefix: '', count: favoriteItems.length, hydrated: true, items: favoriteItems }
						: {
								bucket: bucketName,
								prefix: '',
								count: favoriteItems.length,
								hydrated: false,
								keys: favoriteItems.map((item) => item.key),
							},
				}
			},
		},
		{
			method: 'GET',
			path: /\/api\/v1\/buckets\/[^/]+\/objects\/meta$/,
			handler: ({ url }) => {
				const bucketName = url.pathname.match(/^\/api\/v1\/buckets\/([^/]+)\/objects\/meta$/)?.[1] ?? ''
				if (!availableBuckets.includes(bucketName)) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'bucket not found' } },
					}
				}
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
		{
			method: 'GET',
			path: /\/api\/v1\/buckets\/[^/]+\/objects\/search(?:\?.*)?$/,
			handler: ({ url }) => {
				const bucketName = url.pathname.match(/^\/api\/v1\/buckets\/([^/]+)\/objects\/search$/)?.[1] ?? ''
				if (!availableBuckets.includes(bucketName)) {
					return {
						status: 404,
						json: { error: { code: 'not_found', message: 'bucket not found' } },
					}
				}
				const query = url.searchParams.get('q')?.trim() ?? ''
				return {
					json: {
						items: query ? (options.globalSearchItems ?? []) : [],
						nextCursor: null,
					},
				}
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function openObjectsPage(page: Page, overrides: Record<string, unknown> = {}) {
	await seedLocalStorage(page, {
		objectsUIMode: 'advanced',
		objectsDetailsOpen: false,
		objectsFavoritesOpenDetails: true,
		objectsFavoritesPaneExpanded: false,
		apiToken: 'change-me',
		profileId,
		bucket,
		prefix: '',
		...overrides,
	})
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'), {
		timeout: 20_000,
		maxAttempts: 3,
	})
}

test.describe('Objects adaptive desktop workflows', () => {
	test('uses toolbar tabs, bucket picker, and navigation on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page, {
			objectsTabs: [
				{
					id: 'tab-a',
					bucket,
					prefix: '',
					history: [{ bucket, prefix: '' }],
					historyIndex: 0,
				},
				{
					id: 'tab-b',
					bucket,
					prefix: 'reports/',
					history: [
						{ bucket, prefix: '' },
						{ bucket, prefix: 'reports/' },
					],
					historyIndex: 1,
				},
			],
			objectsActiveTabId: 'tab-a',
		})

		await expect(page.getByTestId('objects-toolbar-tabs')).toBeVisible()
		await expect(page.getByTestId('objects-toolbar-desktop-nav')).toBeVisible()
		await expect(page.getByTestId('objects-toolbar-desktop-actions')).toBeVisible()
		await expect(objectsBucketPickerDesktop(page)).toBeVisible()
		await expect(page.getByRole('button', { name: bucket, exact: true })).toHaveAttribute('aria-pressed', 'true')

		await page.getByRole('button', { name: `${bucket}/reports/`, exact: true }).click()
		await expect(page.getByRole('button', { name: `${bucket}/reports/`, exact: true })).toHaveAttribute('aria-pressed', 'true')
		await expect(page.getByText(`s3://${bucket}/reports/`)).toBeVisible()

		await expect(page.getByRole('button', { name: 'Go back' })).toBeEnabled()
		await page.getByRole('button', { name: 'Go back' }).click()
		await expect(page.getByText(`s3://${bucket}/`)).toBeVisible()

		await expect(page.getByRole('button', { name: 'Go forward' })).toBeEnabled()
		await page.getByRole('button', { name: 'Go forward' }).click()
		await expect(page.getByText(`s3://${bucket}/reports/`)).toBeVisible()

		await expect(page.getByRole('button', { name: 'Go up' })).toBeEnabled()
		await page.getByRole('button', { name: 'Go up' }).click()
		await expect(page.getByText(`s3://${bucket}/`)).toBeVisible()
	})

	test('shows tab overflow affordance on mid-width desktops when many locations are open', async ({ page }) => {
		await page.setViewportSize({ width: 900, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page, {
			objectsTabs: [
				{
					id: 'tab-a',
					bucket,
					prefix: 'reports/2024/q1/summary/mobile-density-review/',
					history: [{ bucket, prefix: 'reports/2024/q1/summary/mobile-density-review/' }],
					historyIndex: 0,
				},
				{
					id: 'tab-b',
					bucket,
					prefix: 'reports/2024/q2/mobile-dashboard/final-assets/',
					history: [{ bucket, prefix: 'reports/2024/q2/mobile-dashboard/final-assets/' }],
					historyIndex: 0,
				},
				{
					id: 'tab-c',
					bucket,
					prefix: 'snapshots/2023/final-review/regression-triage/',
					history: [{ bucket, prefix: 'snapshots/2023/final-review/regression-triage/' }],
					historyIndex: 0,
				},
				{
					id: 'tab-d',
					bucket,
					prefix: 'logs/regional/seoul/2024/04/latency-investigation/',
					history: [{ bucket, prefix: 'logs/regional/seoul/2024/04/latency-investigation/' }],
					historyIndex: 0,
				},
			],
			objectsActiveTabId: 'tab-a',
		})

		const tabsRoot = page.getByTestId('objects-toolbar-tabs').getByRole('toolbar', { name: 'Object workspaces' }).locator('xpath=..')
		await expect(tabsRoot).toHaveAttribute('data-scrollable', 'true')
		await expect(tabsRoot).toHaveAttribute('data-at-start', 'true')
		await expect(tabsRoot).toHaveAttribute('data-at-end', 'false')
	})

	test('keeps long bucket names discoverable and switchable in the mid-width toolbar', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page, {
			bucket: longBucket,
			objectsTabs: [
				{
					id: 'tab-a',
					bucket: longBucket,
					prefix: '',
					history: [{ bucket: longBucket, prefix: '' }],
					historyIndex: 0,
				},
				{
					id: 'tab-b',
					bucket,
					prefix: 'reports/',
					history: [
						{ bucket, prefix: '' },
						{ bucket, prefix: 'reports/' },
					],
					historyIndex: 1,
				},
			],
			objectsActiveTabId: 'tab-a',
		})

		const picker = objectsBucketPickerDesktop(page)
		await expect(picker).toHaveAttribute('title', longBucket)
		await expect(page.getByTestId('objects-bucket-picker-desktop-value')).toHaveAttribute('title', longBucket)

		await picker.click()
		const popover = page.getByTestId('objects-bucket-picker-desktop-popover')
		await expect(popover).toBeVisible()
		await expect(popover.getByText(longBucket)).toBeVisible()

		await popover.getByLabel('Search buckets').fill(bucket)
		await popover.getByTestId('objects-bucket-picker-option-layout-bucket').click()

		await expect(popover).toHaveCount(0)
		await expect(objectsBucketPickerDesktop(page)).toHaveAttribute('title', bucket)
		await expect(page.getByText(`s3://${bucket}/`)).toBeVisible()
	})

	test('uses compact desktop action buttons on mid-width screens', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		const actions = page.getByTestId('objects-toolbar-desktop-actions')
		await expect(actions).toHaveAttribute('data-compact', 'true')
		await expect(actions.getByText('Upload…')).toHaveCount(0)
		await expect(actions.getByText('New folder')).toHaveCount(0)

		await expect(actions.getByRole('button', { name: 'Upload' })).toBeEnabled()
		await expect(actions.getByRole('button', { name: 'New folder' })).toBeEnabled()
		await expect(actions.getByRole('button', { name: 'More actions' })).toBeEnabled()

		await actions.getByRole('button', { name: 'New folder' }).click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await expect(dialog).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)

		await actions.getByRole('button', { name: 'More actions' }).click()
		await expect(page.getByRole('menuitem', { name: 'Folders' })).toBeVisible()
	})

	test('uses compact list controls on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await expect(page.getByTestId('objects-list-controls-root')).toHaveAttribute('data-compact', 'true')
		await expect(page.getByTestId('objects-list-controls-compact-footer')).toBeVisible()
		await expect(page.getByTestId('objects-list-controls-compact-meta')).toContainText('1 folders, 0 files')
		await expect(page.getByText('Search here, or use Indexed Search across the whole bucket.')).toBeVisible()

		await expect(page.getByLabel('Search current folder')).toBeVisible()
		await expect(page.getByRole('button', { name: /Filters$/ })).toBeVisible()
		await expect(page.getByRole('button', { name: /Indexed Search$/ })).toBeVisible()

		const viewMode = page.getByRole('group', { name: 'View mode' })
		await expect(viewMode.getByRole('button', { name: /List$/ })).toHaveAttribute('aria-pressed', 'true')
		await viewMode.getByRole('button', { name: /Grid$/ }).click()
		await expect(viewMode.getByRole('button', { name: /Grid$/ })).toHaveAttribute('aria-pressed', 'true')
	})

	test('shows capped local search guidance and opens indexed search on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, {
			rootObjects: {
				items: buildSearchCapItems(3000),
				nextContinuationToken: 'page-2',
				isTruncated: true,
			},
		})
		await openObjectsPage(page, { objectsSearch: 'search-log' })

		const status = page.getByTestId('objects-list-controls-status-compact')
		await expect(status).toBeVisible()
		await expect(status).toHaveAttribute('data-has-action', 'false')
		await expect(status).toContainText('Search paused at 3,000 items')
		await expect(status).toContainText('Use Indexed Search above to scan the whole bucket.')

		const indexedSearchButton = page.getByRole('button', { name: 'Indexed Search' })
		await expect(indexedSearchButton).toHaveCount(1)
		await indexedSearchButton.click()

		const drawer = page.getByTestId('objects-global-search-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByLabel('Search query')).toBeVisible()
	})

	test('uses global search table actions on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		const searchResultKey = 'reports/2024/mobile-density-review/alpha-findings-summary.txt'
		await stubObjectsAdaptiveApi(page, {
			globalSearchItems: [
				{
					key: searchResultKey,
					size: 4096,
					lastModified: now,
				},
			],
		})
		await openObjectsPage(page)

		await page.getByRole('button', { name: /Indexed Search/ }).click()
		const drawer = page.getByTestId('objects-global-search-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByLabel('Search query').fill('alpha')
		await expect(objectsGlobalSearchTableWrap(drawer)).toBeVisible()

		const row = objectsGlobalSearchTableWrap(drawer).locator('tbody tr').filter({ hasText: 'alpha-findings-summary.txt' }).first()
		await expect(row).toBeVisible()
		const openPrefixButton = row.getByRole('button', { name: `Open ${searchResultKey}` })
		await expect(openPrefixButton).toBeVisible()
		await expect(row.getByRole('button', { name: `Copy key ${searchResultKey}` })).toBeVisible()
		await expect(row.getByRole('button', { name: `Download ${searchResultKey}` })).toBeVisible()
		await expect(row.getByRole('button', { name: `Open details for ${searchResultKey}` })).toBeVisible()

		await openPrefixButton.click()
		await expect(drawer).toHaveCount(0)
		await expect(page.getByText(`s3://${bucket}/reports/2024/mobile-density-review/`)).toBeVisible()
	})

	test('keeps global search results within the drawer on tablet widths', async ({ page }) => {
		await page.setViewportSize({ width: 860, height: 900 })
		const searchResultKey = 'reports/2024/tablet-overflow-check/a-very-long-alpha-findings-summary-name.txt'
		await stubObjectsAdaptiveApi(page, {
			globalSearchItems: [
				{
					key: searchResultKey,
					size: 4096,
					lastModified: now,
				},
			],
		})
		await openObjectsPage(page)

		await page.getByRole('button', { name: /Indexed Search/ }).click()
		const drawer = page.getByTestId('objects-global-search-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByLabel('Search query').fill('alpha')

		const results = drawer.getByTestId('objects-global-search-results')
		await expect(results).toBeVisible()
		await expect(results.locator('[data-global-search-result-card="true"]').filter({ hasText: 'a-very-long-alpha-findings-summary-name.txt' })).toBeVisible()
		await expect(objectsGlobalSearchTableWrap(drawer)).toHaveCount(0)

		const metrics = await drawer.getByTestId('objects-global-search-content').evaluate((node) => ({
			clientWidth: node.clientWidth, // e2e-geometry-allow compares content viewport width against scroll width
			scrollWidth: node.scrollWidth, // e2e-geometry-allow catches horizontal overflow in responsive drawer content
		}))
		expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth + 1) // e2e-geometry-allow asserts no horizontal overflow
	})

	test('filters and toggles favorites controls inside the folders drawer', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Favorites' }).click()
		await expect(objectsFavoritesControls(drawer)).toBeVisible()

		const search = drawer.getByLabel('Find favorite')
		await search.fill('summary')
		await expect(objectsFavoriteItem(drawer, 'summary.txt')).toBeVisible()

		await expect(objectsFavoritesControls(drawer)).toHaveCount(0)

		await search.fill('missing')
		const status = drawer.getByTestId('objects-favorites-status')
		await expect(status).toHaveAttribute('data-favorites-status-kind', 'empty')
		await expect(status).toContainText(noFavoritesMatchQueryTitle('missing'))
		await expect(status).toContainText(clearFavoritesFilterHint())
	})

	test('opens a favorite from the folders drawer and restores object details', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Favorites' }).click()
		const item = objectsFavoriteItem(drawer).first()
		await expect(item).toBeVisible()

		await item.click()

		await expect(drawer).toHaveCount(0)
		await expect(page.getByText(`s3://${bucket}/reports/2024/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'summary.txt')).toBeChecked()
		await expect(page.getByText('Content Type')).toBeVisible()
		await expect(page.getByText('reports/2024/summary.txt')).toBeVisible()
	})

	test('uses folder tree rows and new folder action inside the folders drawer', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()

		const newFolderButton = drawer.getByTestId('objects-tree-new-folder')
		await expect(newFolderButton).toBeEnabled()
		await expect(newFolderButton).toHaveAttribute('aria-label', 'New folder')
		await expectMinTouchHeight(newFolderButton)

		await newFolderButton.click()
		const dialog = page.getByRole('dialog', { name: 'New folder' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel('Folder name')).toBeVisible()
		await dialog.getByRole('button', { name: 'Cancel' }).click()
		await expect(dialog).toHaveCount(0)

		const rootRow = objectsTreeRow(drawer, 0).filter({ hasText: bucket }).first()
		await expect(rootRow).toBeVisible()
		await rootRow.getByRole('button', { name: 'Expand' }).click()

		const childRow = objectsTreeRow(drawer, 1).filter({ hasText: 'reports' }).first()
		await expect(childRow).toBeVisible()
		await childRow.getByRole('button', { name: 'reports', exact: true }).click()

		await expect(drawer).toHaveCount(0)
		await expect(page.getByText(`s3://${bucket}/reports/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'quarterly.csv')).toBeVisible()
	})

	test('shows the folders prerequisite status when no bucket is selected', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await seedLocalStorage(page, {
			objectsUIMode: 'advanced',
			objectsDetailsOpen: false,
			objectsFavoritesOpenDetails: true,
			objectsFavoritesPaneExpanded: false,
			apiToken: 'change-me',
			profileId,
			bucket: '',
			prefix: '',
		})
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-toolbar-more'), {
			timeout: 30_000,
			maxAttempts: 3,
		})

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		const status = objectsTreeStatus(drawer)

		await expect(status).toBeVisible()
		await expect(status).toHaveAttribute('data-tree-status-kind', 'prereq')
		await expect(status).toContainText(selectBucketFirstHint())
		await expect(status).toContainText(pickBucketToBrowseFoldersAndNestedPrefixesHint())
	})

	test('shows the folders empty status after expanding a bucket with no nested folders', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, { rootObjects: { commonPrefixes: [], items: [] } })
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Expand' }).first().click()
		const status = objectsTreeStatus(drawer)

		await expect(status).toHaveAttribute('data-tree-status-kind', 'empty')
		await expect(status).toContainText(noFoldersHereYetTitle())
		await expect(status).toContainText(createFolderOrUploadFilesAtThisLevelHint())
	})

	test('shows the folders error status when a nested prefix scan fails', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, { prefixErrors: { 'reports/': 'Nested prefix scan failed.' } })
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Expand' }).first().click()
		await expect(objectsTreeRow(drawer, 1).first()).toBeVisible()
		await objectsTreeRow(drawer, 1).getByRole('button', { name: 'Expand' }).first().click()
		const status = objectsTreeStatus(drawer)

		await expect(status).toHaveAttribute('data-tree-status-kind', 'error')
		await expect(status).toHaveAttribute('role', 'alert')
		await expect(status).toContainText(failedToLoadFoldersTitle())
		await expect(status).toContainText('Nested prefix scan failed.')
	})

	test('opens the folders sheet from the desktop overflow menu and navigates to a prefix', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()

		const rootRow = objectsTreeRow(drawer, 0).filter({ hasText: bucket }).first()
		await expect(rootRow).toBeVisible()
		await rootRow.getByRole('button', { name: `Expand ${bucket}` }).click()

		const reportsRow = objectsTreeRow(drawer, 1).filter({ hasText: 'reports' }).first()
		await expect(reportsRow).toBeVisible()
		await reportsRow.getByRole('button', { name: 'reports', exact: true }).click()

		await expect(drawer).toHaveCount(0)
		await expect(page.getByText(`s3://${bucket}/reports/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'quarterly.csv')).toBeVisible()
	})

	test('expands the docked favorites pane and restores details on wide screens', async ({ page }) => {
		test.setTimeout(90_000)
		await page.setViewportSize({ width: 1760, height: 960 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await expect(objectsFavoriteItem(page)).toHaveCount(0)
		await page.getByRole('button', { name: 'Favorites' }).click()

		const favoriteItem = objectsFavoriteItem(page, 'summary.txt')
		await expect(favoriteItem).toBeVisible()
		await favoriteItem.click()

		await expect(page.getByText(`s3://${bucket}/reports/2024/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'summary.txt')).toBeChecked()
		await expect(page.getByText('Content Type')).toBeVisible()
		await expect(page.getByText('reports/2024/summary.txt')).toBeVisible()
	})
})
