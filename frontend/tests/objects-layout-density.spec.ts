import { expect, test, type Page } from '@playwright/test'

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
	OBJECTS_BUCKET_PICKER_DESKTOP_SELECTOR,
	OBJECTS_BUCKET_PICKER_DESKTOP_VALUE_SELECTOR,
	OBJECTS_FAVORITE_ITEM_SELECTOR,
	OBJECTS_FAVORITES_CONTROLS_SELECTOR,
	OBJECTS_FAVORITES_LIST_SELECTOR,
	OBJECTS_FOLDERS_PANE_BODY_SELECTOR,
	OBJECTS_FOLDERS_PANE_SELECTOR,
	OBJECTS_GLOBAL_SEARCH_TABLE_WRAP_SELECTOR,
	OBJECTS_LIST_CONTROLS_COMPACT_FOOTER_SELECTOR,
	OBJECTS_LIST_CONTROLS_COMPACT_META_SELECTOR,
	OBJECTS_LIST_CONTROLS_ROOT_SELECTOR,
	OBJECTS_LIST_CONTROLS_STATUS_COMPACT_SELECTOR,
	OBJECTS_TOOLBAR_DESKTOP_ACTIONS_SELECTOR,
	OBJECTS_TOOLBAR_DESKTOP_NAV_SELECTOR,
	OBJECTS_TOOLBAR_TABS_SELECTOR,
	OBJECTS_TREE_NEW_FOLDER_SELECTOR,
	OBJECTS_TREE_ROW_SELECTOR,
	OBJECTS_TREE_STATUS_SELECTOR,
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

const objectsLayoutSelectors = {
	bucketPickerDesktop: OBJECTS_BUCKET_PICKER_DESKTOP_SELECTOR,
	bucketPickerDesktopValue: OBJECTS_BUCKET_PICKER_DESKTOP_VALUE_SELECTOR,
	favoriteItem: OBJECTS_FAVORITE_ITEM_SELECTOR,
	favoritesControls: OBJECTS_FAVORITES_CONTROLS_SELECTOR,
	favoritesList: OBJECTS_FAVORITES_LIST_SELECTOR,
	foldersPane: OBJECTS_FOLDERS_PANE_SELECTOR,
	foldersPaneBody: OBJECTS_FOLDERS_PANE_BODY_SELECTOR,
	globalSearchTableWrap: OBJECTS_GLOBAL_SEARCH_TABLE_WRAP_SELECTOR,
	listControlsCompactFooter: OBJECTS_LIST_CONTROLS_COMPACT_FOOTER_SELECTOR,
	listControlsCompactMeta: OBJECTS_LIST_CONTROLS_COMPACT_META_SELECTOR,
	listControlsRoot: OBJECTS_LIST_CONTROLS_ROOT_SELECTOR,
	listControlsStatusCompact: OBJECTS_LIST_CONTROLS_STATUS_COMPACT_SELECTOR,
	toolbarDesktopActions: OBJECTS_TOOLBAR_DESKTOP_ACTIONS_SELECTOR,
	toolbarDesktopNav: OBJECTS_TOOLBAR_DESKTOP_NAV_SELECTOR,
	toolbarTabs: OBJECTS_TOOLBAR_TABS_SELECTOR,
	treeNewFolder: OBJECTS_TREE_NEW_FOLDER_SELECTOR,
	treeRowDepth0: `${OBJECTS_TREE_ROW_SELECTOR}[data-tree-depth="0"]`,
	treeRowDepth1: `${OBJECTS_TREE_ROW_SELECTOR}[data-tree-depth="1"]`,
	treeRow: OBJECTS_TREE_ROW_SELECTOR,
	treeStatus: OBJECTS_TREE_STATUS_SELECTOR,
} as const

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
		timeout: 10_000,
		maxAttempts: 3,
	})
}

async function readFoldersStatusMetrics(page: Page) {
	return page.evaluate((selectors) => {
		const pane = document.querySelector(selectors.foldersPane)
		const body = pane?.querySelector(selectors.foldersPaneBody)
		const status = pane?.querySelector(selectors.treeStatus)
		if (!(body instanceof HTMLElement) || !(status instanceof HTMLElement)) {
			return null
		}

		const bodyRect = body.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
		const statusRect = status.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
		return {
			kind: status.getAttribute('data-tree-status-kind'),
			height: Math.round(statusRect.height),
			bodyTopInset: Math.round(statusRect.top - bodyRect.top),
			overflowing: status.scrollWidth > status.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
		}
	}, objectsLayoutSelectors)
}

test.describe('Objects adaptive desktop workflows', () => {
	test('keeps tab, bucket picker, and toolbar groups tightly spaced on mid-width desktops', async ({ page }) => {
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

		const metrics = await page.evaluate((selectors) => {
			const tabs = document.querySelector(selectors.toolbarTabs)
			const topGroup = document.querySelector(selectors.toolbarDesktopNav)
			const actions = document.querySelector(selectors.toolbarDesktopActions)
			const bucketTrigger = document.querySelector(selectors.bucketPickerDesktop)
			if (!(tabs instanceof HTMLElement) || !(topGroup instanceof HTMLElement) || !(actions instanceof HTMLElement) || !(bucketTrigger instanceof HTMLElement)) {
				return null
			}

			const tabsRect = tabs.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const topGroupRect = topGroup.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const actionsRect = actions.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract
			const bucketRect = bucketTrigger.getBoundingClientRect() // e2e-geometry-allow: explicit responsive density contract

			return {
				tabsToToolbarGap: Math.round(topGroupRect.top - tabsRect.bottom),
				tabsToBucketGap: Math.round(bucketRect.top - tabsRect.bottom),
				groupGap: Math.round(actionsRect.top - topGroupRect.bottom),
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing mid-width toolbar metrics')
		}

		expect(metrics.tabsToToolbarGap, JSON.stringify(metrics)).toBeLessThan(12)
		expect(metrics.tabsToBucketGap, JSON.stringify(metrics)).toBeLessThan(16)
		expect(metrics.groupGap, JSON.stringify(metrics)).toBeLessThan(12)
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

		const metrics = await page.evaluate((selectors) => {
			const tabsWrap = document.querySelector(selectors.toolbarTabs)
			const tabList = tabsWrap?.querySelector('[role="tablist"]')
			const tabsRoot = tabList?.parentElement
			if (!(tabsWrap instanceof HTMLElement) || !(tabList instanceof HTMLElement) || !(tabsRoot instanceof HTMLElement)) {
				return null
			}

			return {
				scrollable: tabsRoot.dataset.scrollable,
				atStart: tabsRoot.dataset.atStart,
				atEnd: tabsRoot.dataset.atEnd,
				scrollWidth: Math.round(tabList.scrollWidth), // e2e-geometry-allow: explicit responsive density contract
				clientWidth: Math.round(tabList.clientWidth), // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing tab overflow metrics')
		}

		expect(metrics.scrollable, JSON.stringify(metrics)).toBe('true')
		expect(metrics.atStart, JSON.stringify(metrics)).toBe('true')
		expect(metrics.atEnd, JSON.stringify(metrics)).toBe('false')
		expect(metrics.scrollWidth, JSON.stringify(metrics)).toBeGreaterThan(metrics.clientWidth) // e2e-geometry-allow: explicit responsive density contract
	})

	test('keeps long bucket names truncated without widening the mid-width toolbar', async ({ page }) => {
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

		const metrics = await page.evaluate((selectors) => {
			const trigger = document.querySelector(selectors.bucketPickerDesktop)
			const label = document.querySelector(selectors.bucketPickerDesktopValue)
			const navGroup = document.querySelector(selectors.toolbarDesktopNav)
			if (!(trigger instanceof HTMLElement) || !(label instanceof HTMLElement) || !(navGroup instanceof HTMLElement)) {
				return null
			}

			return {
				triggerWidth: Math.round(trigger.getBoundingClientRect().width), // e2e-geometry-allow: explicit responsive density contract
				labelClientWidth: Math.round(label.clientWidth), // e2e-geometry-allow: explicit responsive density contract
				labelScrollWidth: Math.round(label.scrollWidth), // e2e-geometry-allow: explicit responsive density contract
				triggerTitle: label.getAttribute('title'),
				navOverflowing: navGroup.scrollWidth > navGroup.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing bucket picker truncation metrics')
		}

		expect(metrics.triggerTitle, JSON.stringify(metrics)).toBe(longBucket)
		expect(metrics.labelScrollWidth, JSON.stringify(metrics)).toBeGreaterThan(metrics.labelClientWidth)
		expect(metrics.navOverflowing, JSON.stringify(metrics)).toBe(false)
		expect(metrics.triggerWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(260)
	})

	test('compacts the desktop action group on mid-width screens to avoid wrapping', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		const metrics = await page.evaluate((selectors) => {
			const actions = document.querySelector(selectors.toolbarDesktopActions)
			if (!(actions instanceof HTMLElement)) {
				return null
			}

			const buttons = Array.from(actions.querySelectorAll('button')).map((button) => ({
				text: button.textContent?.trim() ?? '',
				width: Math.round(button.getBoundingClientRect().width), // e2e-geometry-allow: explicit responsive density contract
				height: Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			}))

			return {
				compact: actions.dataset.compact,
				height: Math.round(actions.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				overflowing: actions.scrollWidth > actions.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
				buttons,
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing desktop action group metrics')
		}

		expect(metrics.compact, JSON.stringify(metrics)).toBe('true')
		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(32)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
		expect(metrics.buttons.every((button) => button.text === ''), JSON.stringify(metrics)).toBe(true)
		expect(metrics.buttons.every((button) => button.height <= 32), JSON.stringify(metrics)).toBe(true)
	})

	test('keeps compact list controls dense on mid-width desktops without horizontal overflow', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		const metrics = await page.evaluate((selectors) => {
			const root = document.querySelector(selectors.listControlsRoot)
			const footer = document.querySelector(selectors.listControlsCompactFooter)
			const meta = document.querySelector(selectors.listControlsCompactMeta)
			if (!(root instanceof HTMLElement) || !(footer instanceof HTMLElement) || !(meta instanceof HTMLElement)) {
				return null
			}

			return {
				compact: root.dataset.compact,
				footerHeight: Math.round(footer.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				metaHeight: Math.round(meta.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				rootOverflowing: root.scrollWidth > root.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
				footerOverflowing: footer.scrollWidth > footer.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing compact list controls metrics')
		}

		expect(metrics.compact, JSON.stringify(metrics)).toBe('true')
		expect(metrics.footerHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(40)
		expect(metrics.metaHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(44)
		expect(metrics.rootOverflowing, JSON.stringify(metrics)).toBe(false)
		expect(metrics.footerOverflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps the capped search status compact on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, {
			rootObjects: {
				items: buildSearchCapItems(3000),
				nextContinuationToken: 'page-2',
				isTruncated: true,
			},
		})
		await openObjectsPage(page, { objectsSearch: 'search-log' })

		await expect(page.getByTestId('objects-list-controls-status-compact')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Global Search (Indexed)' })).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const root = document.querySelector(selectors.listControlsRoot)
			const status = document.querySelector(selectors.listControlsStatusCompact)
			if (!(root instanceof HTMLElement) || !(status instanceof HTMLElement)) {
				return null
			}

			return {
				compact: root.dataset.compact,
				hasAction: status.dataset.hasAction,
				statusHeight: Math.round(status.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				rootOverflowing: root.scrollWidth > root.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
				statusOverflowing: status.scrollWidth > status.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing compact search status metrics')
		}

		expect(metrics.compact, JSON.stringify(metrics)).toBe('true')
		expect(metrics.hasAction, JSON.stringify(metrics)).toBe('false')
		expect(metrics.statusHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(56)
		expect(metrics.rootOverflowing, JSON.stringify(metrics)).toBe(false)
		expect(metrics.statusOverflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps the global search table rows and action column dense on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, {
			globalSearchItems: [
				{
					key: 'reports/2024/mobile-density-review/alpha-findings-summary.txt',
					size: 4096,
					lastModified: now,
				},
			],
		})
		await openObjectsPage(page)

		await page.getByRole('button', { name: /Bucket search|Global Search \(Indexed\)/ }).click()
		const drawer = page.getByTestId('objects-global-search-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByLabel('Search query').fill('alpha')
		await expect(objectsGlobalSearchTableWrap(drawer)).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const tableWrap = document.querySelector(selectors.globalSearchTableWrap)
			const firstRow = tableWrap?.querySelector('tbody tr')
			const actionRow = tableWrap?.querySelector('[data-global-search-table-action-row="true"]')
			const actionHeader = tableWrap?.querySelector('th:last-child')
			if (!(tableWrap instanceof HTMLElement) || !(firstRow instanceof HTMLElement) || !(actionRow instanceof HTMLElement) || !(actionHeader instanceof HTMLElement)) {
				return null
			}

			const buttons = Array.from(actionRow.querySelectorAll('button')).map((button) => ({
				height: Math.round(button.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
			}))

			return {
				rowHeight: Math.round(firstRow.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				actionRowHeight: Math.round(actionRow.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				actionHeaderWidth: Math.round(actionHeader.getBoundingClientRect().width), // e2e-geometry-allow: explicit responsive density contract
				actionOverflowing: actionRow.scrollWidth > actionRow.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
				buttons,
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing global search table metrics')
		}

		expect(metrics.rowHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(48)
		expect(metrics.actionRowHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(30)
		expect(metrics.actionHeaderWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(230)
		expect(metrics.actionOverflowing, JSON.stringify(metrics)).toBe(false)
		expect(metrics.buttons.every((button) => button.height <= 28), JSON.stringify(metrics)).toBe(true)
	})

	test('keeps the favorites controls tight inside the folders drawer on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Favorites' }).click()
		await expect(objectsFavoritesControls(drawer)).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const controls = document.querySelector(selectors.favoritesControls)
			if (!(controls instanceof HTMLElement)) {
				return null
			}

			const styles = window.getComputedStyle(controls)
			return {
				height: Math.round(controls.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				rowGap: Math.round(parseFloat(styles.rowGap || styles.gap || '0')),
				columnGap: Math.round(parseFloat(styles.columnGap || styles.gap || '0')),
				overflowing: controls.scrollWidth > controls.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing favorites controls metrics')
		}

		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(32)
		expect(metrics.rowGap, JSON.stringify(metrics)).toBeLessThanOrEqual(4)
		expect(metrics.columnGap, JSON.stringify(metrics)).toBeLessThanOrEqual(10)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps favorite rows compact inside the folders drawer on mid-width desktops', async ({ page }) => {
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

		const metrics = await page.evaluate((selectors) => {
			const list = document.querySelector(selectors.favoritesList)
			const item = document.querySelector(selectors.favoriteItem)
			if (!(list instanceof HTMLElement) || !(item instanceof HTMLElement)) {
				return null
			}

			const listStyles = window.getComputedStyle(list)
			return {
				height: Math.round(item.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				rowGap: Math.round(parseFloat(listStyles.rowGap || listStyles.gap || '0')),
				overflowing: item.scrollWidth > item.clientWidth + 1, // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing favorites row metrics')
		}

		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(38)
		expect(metrics.rowGap, JSON.stringify(metrics)).toBeLessThanOrEqual(3)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps folder tree rows, indent, and header action compact on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Expand' }).first().click()
		await expect(objectsTreeRow(drawer, 1).first()).toBeVisible()

		const metrics = await page.evaluate((selectors) => {
			const pane = document.querySelector(selectors.foldersPane)
			const rootRow = pane?.querySelector(selectors.treeRowDepth0)
			const childRow = pane?.querySelector(selectors.treeRowDepth1)
			const action = pane?.querySelector(selectors.treeNewFolder)
			if (!(rootRow instanceof HTMLElement) || !(childRow instanceof HTMLElement) || !(action instanceof HTMLElement)) {
				return null
			}

			return {
				rootRowHeight: Math.round(rootRow.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				childRowHeight: Math.round(childRow.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				childIndent: Math.round(parseFloat(window.getComputedStyle(childRow).paddingLeft || '0')),
				actionHeight: Math.round(action.getBoundingClientRect().height), // e2e-geometry-allow: explicit responsive density contract
				actionWidth: Math.round(action.getBoundingClientRect().width), // e2e-geometry-allow: explicit responsive density contract
			}
		}, objectsLayoutSelectors)

		if (!metrics) {
			throw new Error('Missing tree row metrics')
		}

		expect(metrics.rootRowHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(24)
		expect(metrics.childRowHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(24)
		expect(metrics.childIndent, JSON.stringify(metrics)).toBeLessThanOrEqual(12)
		expect(metrics.actionHeight, JSON.stringify(metrics)).toBeLessThanOrEqual(24)
		expect(metrics.actionWidth, JSON.stringify(metrics)).toBeLessThanOrEqual(24)
	})

	test('keeps the folders prerequisite status block and body inset compact on mid-width desktops', async ({ page }) => {
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
			timeout: 10_000,
			maxAttempts: 3,
		})

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await expect(objectsTreeStatus(drawer)).toBeVisible()

		const metrics = await readFoldersStatusMetrics(page)
		if (!metrics) {
			throw new Error('Missing folders prerequisite status metrics')
		}

		expect(metrics.kind, JSON.stringify(metrics)).toBe('prereq')
		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(52)
		expect(metrics.bodyTopInset, JSON.stringify(metrics)).toBeLessThanOrEqual(6)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps the folders empty status block compact on mid-width desktops', async ({ page }) => {
		await page.setViewportSize({ width: 1040, height: 900 })
		await stubObjectsAdaptiveApi(page, { rootObjects: { commonPrefixes: [], items: [] } })
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()
		await drawer.getByRole('button', { name: 'Expand' }).first().click()
		await expect(objectsTreeStatus(drawer)).toHaveAttribute('data-tree-status-kind', 'empty')

		const metrics = await readFoldersStatusMetrics(page)
		if (!metrics) {
			throw new Error('Missing folders empty status metrics')
		}

		expect(metrics.kind, JSON.stringify(metrics)).toBe('empty')
		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(52)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('keeps the folders error status block compact on mid-width desktops', async ({ page }) => {
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
		await expect(objectsTreeStatus(drawer)).toHaveAttribute('data-tree-status-kind', 'error')

		const metrics = await readFoldersStatusMetrics(page)
		if (!metrics) {
			throw new Error('Missing folders error status metrics')
		}

		expect(metrics.kind, JSON.stringify(metrics)).toBe('error')
		expect(metrics.height, JSON.stringify(metrics)).toBeLessThanOrEqual(56)
		expect(metrics.overflowing, JSON.stringify(metrics)).toBe(false)
	})

	test('opens the folders sheet from the desktop overflow menu and navigates to a prefix', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await stubObjectsAdaptiveApi(page)
		await openObjectsPage(page)

		await page.getByTestId('objects-toolbar-more').click()
		await page.getByRole('menuitem', { name: 'Folders' }).click()

		const drawer = page.getByTestId('objects-tree-sheet')
		await expect(drawer).toBeVisible()

		const tree = drawer.getByRole('tree').first()
		await tree.getByRole('button', { name: 'Expand' }).first().click()
		await tree.getByRole('button', { name: 'reports' }).click()

		await expect(drawer).toHaveCount(0)
		await expect(page.getByText(`s3://${bucket}/reports/`)).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'quarterly.csv')).toBeVisible()
	})

	test('expands the docked favorites pane and restores details on wide screens', async ({ page }) => {
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
