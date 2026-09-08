import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installMockApi,
	seedLocalStorage,
} from './support/apiFixtures'
import {
	OBJECTS_LIST_ROW_SELECTOR,
	dialogByName,
	gotoObjectsPage,
	objectsContextMenu,
	objectsListRow,
	objectsListRows,
	objectsSelectionCheckbox,
	openTransfersDialog,
} from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	objectsUIMode: 'simple' | 'advanced'
}

type ObjectItem = {
	key: string
	size: number
	lastModified: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'playwright-token',
	profileId: 'playwright-profile',
	bucket: 'test-bucket',
	objectsUIMode: 'advanced',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, {
		...defaultStorage,
		prefix: '',
		...overrides,
	})
}

function buildObjectItems(count: number): ObjectItem[] {
	const start = Date.parse('2024-01-01T00:00:00Z')
	return Array.from({ length: count }, (_, index) => ({
		key: `video-${index + 1}.mp4`,
		size: 1024 * (index + 1),
		lastModified: new Date(start + index * 1000).toISOString(),
	}))
}

async function stubObjectsApi(page: Page, items: ObjectItem[], commonPrefixes: string[] = []) {
	const now = '2024-01-01T00:00:00Z'
	const { bucket, profileId } = defaultStorage

	await installMockApi(page, [
		{
			method: 'GET',
			path: '/events',
			handle: ({ text }) => text('', 200, 'text/event-stream'),
		},
		{
			method: 'GET',
			path: '/meta',
			handle: ({ json }) => json(buildMetaFixture()),
		},
		{
			method: 'GET',
			path: '/profiles',
			handle: ({ json }) =>
				json([
					buildProfileFixture({
						id: profileId,
						createdAt: now,
						updatedAt: now,
					}),
				]),
		},
		{
			method: 'GET',
			path: '/buckets',
			handle: ({ json }) => json([buildBucketFixture(bucket, { createdAt: now })]),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects`,
			handle: ({ json }) => json(buildObjectsListFixture({ bucket, items, commonPrefixes })),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects/favorites`,
			handle: ({ json }) => json(buildFavoritesFixture({ bucket })),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/objects/meta`,
			handle: ({ url, json }) => {
				const key = url.searchParams.get('key') ?? ''
				const item = items.find((entry) => entry.key === key)
				if (!item) {
					return json({ error: { code: 'not_found', message: 'object not found' } }, 404)
				}
				return json({
					key: item.key,
					size: item.size,
					etag: `"${item.key}"`,
					lastModified: item.lastModified,
					contentType: 'video/mp4',
					metadata: { suite: 'objects-context-menu' },
				})
			},
		},
	])
}

test.describe('Objects context menus', () => {
	test('leaving Objects discards a pending device-folder selection', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(1))
		await seedStorage(page)
		await page.addInitScript(() => {
			Object.defineProperty(window, 'showDirectoryPicker', { configurable: true, value: () => new Promise((resolve) => {
				Object.assign(window, { finishDownloadPicker: () => resolve({ name: 'Stale download folder' }) })
			}) })
		})
		await gotoObjectsPage(page)
		await objectsListRow(page, 'video-1.mp4').click({ button: 'right' })
		await page.getByRole('menuitem', { name: 'Download to folder…' }).click()
		await expect.poll(() => page.evaluate(() => 'finishDownloadPicker' in window)).toBe(true)
		await page.getByRole('link', { name: 'Buckets', exact: true }).click()
		await expect(page).toHaveURL(/\/buckets$/)
		await expect(page.getByTestId('objects-list-controls-root')).toHaveCount(0)
		await page.evaluate(async () => {
			const picker = window as typeof window & { finishDownloadPicker: () => void }
			picker.finishDownloadPicker()
			await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
		})
		await expect(page.getByRole('dialog', { name: /Transfers/i })).toHaveCount(0)
		const transfers = await openTransfersDialog(page, { tabName: /Downloads/i })
		await expect(transfers.getByText('No downloads yet')).toBeVisible()
		await expect(transfers.getByText('Stale download folder')).toHaveCount(0)
	})

	for (const mode of ['copy', 'move'] as const) {
		test(`advanced object menu submits a ${mode} job with the displayed source`, async ({ page }) => {
			await stubObjectsApi(page, buildObjectItems(1))
			const requests: Array<{ profileId: string | undefined; body: unknown }> = []
			await page.route('**/api/v1/jobs', (route) => {
				const request = route.request()
				if (request.method() !== 'POST') return route.fallback()
				const body = request.postDataJSON()
				requests.push({ profileId: request.headers()['x-profile-id'], body })
				return route.fulfill({ status: 201, json: { ...body, id: `job-${mode}`, status: 'queued', createdAt: '2024-01-01T00:00:00Z' } })
			})
			await page.route(`**/api/v1/jobs/job-${mode}`, (route) => route.fulfill({ json: {
				id: `job-${mode}`, type: `transfer_${mode}_object`, status: 'queued', payload: {}, createdAt: '2024-01-01T00:00:00Z',
			} }))
			await page.route(`**/api/v1/jobs/job-${mode}/logs**`, (route) => route.fulfill({ body: '' }))
			await page.route('**/api/v1/jobs?**', (route) => route.fulfill({ json: { items: [], nextCursor: null } }))
			await seedStorage(page)
			await gotoObjectsPage(page)
			await objectsListRow(page, 'video-1.mp4').click({ button: 'right' })
			const menu = objectsContextMenu(page)
			await expect(menu).toHaveCSS('opacity', '1')
			await menu.getByRole('menuitem', { name: mode === 'copy' ? 'Copy…' : 'Move/Rename…' }).click()
			const dialog = dialogByName(page, mode === 'copy' ? 'Copy object…' : 'Move/Rename object…')
			await expect(dialog.getByText(`s3://${defaultStorage.bucket}/video-1.mp4`)).toBeVisible()
			await dialog.getByLabel('Destination key').fill('archive/video-1.mp4')
			if (mode === 'move') await dialog.getByLabel('Type "MOVE" to confirm').fill('MOVE')
			await dialog.getByRole('button', { name: mode === 'copy' ? 'Start copy' : 'Start move' }).click()
			await expect(dialog).toHaveCount(0)
			expect(requests).toEqual([{
				profileId: defaultStorage.profileId,
				body: {
					type: `transfer_${mode}_object`,
					payload: { srcBucket: defaultStorage.bucket, srcKey: 'video-1.mp4', dstBucket: defaultStorage.bucket, dstKey: 'archive/video-1.mp4', dryRun: false },
				},
			}])
			await page.getByRole('button', { name: 'Open Jobs', exact: true }).click()
			const details = dialogByName(page, 'Job Details')
			await expect(details.getByText(`job-${mode}`, { exact: true })).toBeVisible()
			await expect(details.getByText('queued', { exact: true })).toBeVisible()
		})
	}


	for (const action of ['copy', 'move', 'rename', 'zip', 'delete', 'index'] as const) {
		test(`folder ${action} opens the created job from its notification`, async ({ page }) => {
			await stubObjectsApi(page, [], ['docs/'])
			const jobId = `folder-${action}-job`
			let createdJob: Record<string, unknown> = {}
			await page.route('**/api/v1/jobs', (route) => {
				if (route.request().method() !== 'POST') return route.fulfill({ json: { items: [], nextCursor: null } })
				createdJob = { ...route.request().postDataJSON(), id: jobId, status: 'queued', createdAt: '2024-01-01T00:00:00Z' }
				return route.fulfill({ status: 201, json: createdJob })
			})
			await page.route('**/api/v1/jobs?**', (route) => route.fulfill({ json: { items: [], nextCursor: null } }))
			await page.route(`**/api/v1/jobs/${jobId}`, (route) => route.fulfill({ json: createdJob }))
			await page.route(`**/api/v1/jobs/${jobId}/logs**`, (route) => route.fulfill({ body: '' }))
			await page.route('**/objects/index-summary**', (route) => route.fulfill({
				json: { bucket: defaultStorage.bucket, prefix: 'docs/', objectCount: 0, totalBytes: 0, indexedAt: null, sampleKeys: [] },
			}))
			await seedStorage(page)
			await gotoObjectsPage(page)
			await objectsListRow(page, 'docs/').click({ button: 'right' })
			const menu = page.getByRole('menu').last()
			const label = { copy: 'Copy folder…', move: 'Move folder…', rename: 'Rename folder…', zip: 'Download folder (zip)', delete: 'Delete folder…', index: 'Copy folder…' }[action]
			await menu.getByRole('menuitem', { name: label }).first().click()
			if (action === 'copy' || action === 'move') {
				const dialog = dialogByName(page, label)
				await dialog.getByRole('textbox', { name: 'Destination folder', exact: true }).fill('archive/')
				if (action === 'move') await dialog.getByLabel('Type "MOVE" to confirm').fill('MOVE')
				await dialog.getByRole('button', { name: action === 'copy' ? 'Start copy' : 'Start move' }).click()
			} else if (action === 'rename') {
				const dialog = dialogByName(page, label)
				await dialog.getByLabel('New name', { exact: true }).fill('archive')
				await dialog.getByLabel('Type "RENAME" to confirm').fill('RENAME')
				await dialog.getByRole('button', { name: 'Rename', exact: true }).click()
			} else if (action === 'delete') {
				const dialog = dialogByName(page, 'Delete folder')
				await dialog.getByLabel('Type DELETE to confirm').fill('DELETE')
				await dialog.getByRole('button', { name: 'Delete folder', exact: true }).click()
			} else if (action === 'index') {
				const dialog = dialogByName(page, 'Copy folder…')
				await dialog.getByRole('button', { name: 'Index prefix', exact: true }).click()
			}
			await page.getByRole('button', { name: 'Open Jobs', exact: true }).click()
			const details = dialogByName(page, 'Job Details')
			await expect(details.getByText(jobId, { exact: true })).toBeVisible()
			await expect(details.getByText('queued', { exact: true })).toBeVisible()
		})
	}

	test('simple mode exposes file-manager actions from row and empty-area right clicks', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page, { objectsUIMode: 'simple' })
		await gotoObjectsPage(page)

		await objectsListRow(page, 'video-1.mp4').click({ button: 'right' })
		const menu = objectsContextMenu(page)
		await expect(menu.getByRole('menuitem', { name: /Copy.*Ctrl\/Cmd\+C/ })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: /Cut.*Ctrl\/Cmd\+X/ })).toBeVisible()

		await page.getByRole('heading', { name: 'Objects' }).click()
		const scroller = page.getByRole('list', { name: 'Objects list' })
		await scroller.evaluate((element) => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow targets empty list space for a native contextmenu event
			element.dispatchEvent(new MouseEvent('contextmenu', {
				bubbles: true,
				cancelable: true,
				clientX: rect.left + 12,
				clientY: rect.bottom - 12,
			}))
		})
		await expect(menu.getByRole('menuitem', { name: /Paste.*Ctrl\/Cmd\+V/ })).toBeVisible()
	})

	test('list menu still launches a real action in a short viewport', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 240 })
		await gotoObjectsPage(page)

		await expect(page.getByTestId('objects-upload-dropzone')).toBeVisible()
		await expect(objectsListRows(page).first()).toBeVisible()

		try {
			await page.evaluate((rowSelector) => {
				document.querySelectorAll<HTMLElement>(rowSelector).forEach((el) => {
					el.style.pointerEvents = 'none'
				})
			}, OBJECTS_LIST_ROW_SELECTOR)

			const scroller = page.locator('[data-testid="objects-upload-dropzone"] [class*="_listScroller"]')
			await scroller.scrollIntoViewIfNeeded()
			await expect(scroller).toBeVisible()

			const menu = objectsContextMenu(page)
			const newFolderItem = menu.getByRole('menuitem', { name: 'New folder…' })
			const dialog = page.getByRole('dialog', { name: 'New folder' })
			await expect(async () => {
				await scroller.click({ button: 'right', position: { x: 12, y: 12 } })
				await expect(menu).toBeVisible({ timeout: 1_000 })
				await expect(newFolderItem).toBeVisible({ timeout: 1_000 })
				await newFolderItem.click({ timeout: 2_000 })
				await expect(dialog).toBeVisible({ timeout: 2_000 })
			}).toPass({ timeout: 30_000 })
			await expect(dialog.getByLabel('Folder name')).toBeVisible()
		} finally {
			if (!page.isClosed()) {
				await page.evaluate((rowSelector) => {
					document.querySelectorAll<HTMLElement>(rowSelector).forEach((el) => {
						el.style.pointerEvents = ''
					})
				}, OBJECTS_LIST_ROW_SELECTOR)
			}
		}
	})

	test('near-bottom object menu still opens details in a constrained desktop viewport', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(12))
		await seedStorage(page)
		await page.setViewportSize({ width: 780, height: 360 })
		await gotoObjectsPage(page)

		const rows = objectsListRows(page)
		await expect(rows.first()).toBeVisible()
		const scroller = page.locator('[data-testid="objects-upload-dropzone"] [class*="_listScroller"]')
		await expect(scroller).toBeVisible()
		await scroller.evaluate((element) => {
			element.scrollTop = element.scrollHeight
		})

		const target = objectsListRow(page, 'video-12.mp4')
		await expect(target).toBeVisible()
		await target.scrollIntoViewIfNeeded()
		const menuTrigger = target.getByRole('button', { name: /Object actions for video-12\.mp4/ })
		await expect(menuTrigger).toBeVisible()

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		const detailsItem = menu.getByRole('menuitem', { name: 'Details' })
		await expect(async () => {
			if (!(await menu.isVisible().catch(() => false))) {
				await menuTrigger.evaluate((element) => {
					;(element as HTMLElement).click()
				})
			}
			await expect(detailsItem).toBeVisible({ timeout: 2_000 })
			await detailsItem.click({ timeout: 2_000 })
		}).toPass({ timeout: 30_000 })

		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByRole('heading', { name: 'Details' })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Copy key' })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Download (client)' })).toBeVisible()
		await drawer.getByRole('button', { name: 'Close', exact: true }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('mobile object menu still opens details while the selection bar is visible', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await page.setViewportSize({ width: 390, height: 844 })
		await gotoObjectsPage(page)

		const row = objectsListRow(page, 'video-1.mp4')
		await expect(row).toBeVisible()
		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await expect(page.getByText('1 selected')).toBeVisible()

		await row.getByRole('button', { name: /Object actions/ }).evaluate((element) => {
			;(element as HTMLElement).click()
		})

		const menu = page
			.getByRole('menu')
			.filter({ has: page.getByRole('menuitem', { name: 'Download (client)' }) })
			.last()
		await expect(menu).toBeVisible()

		await menu.getByRole('menuitem', { name: 'Details' }).click()
		const drawer = page.getByTestId('objects-details-sheet')
		await expect(drawer).toBeVisible()
		await expect(drawer.getByRole('heading', { name: 'Details' })).toBeVisible()
		await expect(drawer.getByRole('cell', { name: 'video-1.mp4', exact: true })).toBeVisible()
		await drawer.getByRole('button', { name: 'Close', exact: true }).click()
		await expect(drawer).toHaveCount(0)
	})

	test('right-clicking a selected object keeps the bulk selection and opens selection actions', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await gotoObjectsPage(page)

		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await objectsSelectionCheckbox(page, 'video-2.mp4').click()
		await expect(page.getByText('2 selected')).toBeVisible()

		const selectedRow = objectsListRow(page, 'video-1.mp4')
		await selectedRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(page.getByText('2 selected')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'video-1.mp4')).toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-2.mp4')).toBeChecked()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toHaveCount(0)
	})

	test('right-clicking an unselected object retargets selection before opening object actions', async ({ page }) => {
		await stubObjectsApi(page, buildObjectItems(3))
		await seedStorage(page)
		await gotoObjectsPage(page)

		await objectsSelectionCheckbox(page, 'video-1.mp4').click()
		await objectsSelectionCheckbox(page, 'video-2.mp4').click()
		await expect(page.getByText('2 selected')).toBeVisible()

		const targetRow = objectsListRow(page, 'video-3.mp4')
		await targetRow.click({ button: 'right' })

		const menu = objectsContextMenu(page)
		await expect(menu).toBeVisible()
		await expect(page.getByText('1 selected')).toBeVisible()
		await expect(objectsSelectionCheckbox(page, 'video-1.mp4')).not.toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-2.mp4')).not.toBeChecked()
		await expect(objectsSelectionCheckbox(page, 'video-3.mp4')).toBeChecked()
		await expect(menu.getByRole('menuitem', { name: 'Details' })).toBeVisible()
		await expect(menu.getByRole('menuitem', { name: 'Move selection to…' })).toHaveCount(0)
	})
})
