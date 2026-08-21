import { expect, test, type Page } from '@playwright/test'

import {
	clipboardInsecureOriginHint,
	directoryPickerInsecureOriginReason,
	localFolderAccessUnavailableTitle,
} from '../src/lib/secureContext'
import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	seedLocalStorage,
	textFixture,
} from './support/apiFixtures'
import { gotoWithDynamicImportRecovery } from './support/ui'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
	prefix: string
	objectsUIMode: 'simple' | 'advanced'
}

const now = '2024-01-01T00:00:00Z'
const webviewJobsDrawerTimeoutMs = 30_000
const webviewJobsDrawerTestTimeoutMs = 60_000
const webviewObjectsReadyTimeoutMs = 90_000
const webviewObjectsTestTimeoutMs = 180_000

const defaultStorage: StorageSeed = {
	apiToken: 'webview-token',
	profileId: 'webview-profile',
	bucket: 'webview-bucket',
	prefix: 'reports/2024/',
	objectsUIMode: 'advanced',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function installWebviewFixtures(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			buildMetaFixture({
				capabilities: { profileTls: { enabled: false, reason: 'test' }, providers: {} },
				allowedLocalDirs: [],
				uploadDirectStream: false,
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			buildProfileFixture({
				id: seed.profileId,
				name: 'Webview QA Profile',
				createdAt: now,
				updatedAt: now,
			}),
		]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture(seed.bucket, { createdAt: now })]),
		{
			method: 'GET',
			path: `/api/v1/buckets/${seed.bucket}/objects`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				const prefix = url.searchParams.get('prefix') ?? ''
				const items = prefix === seed.prefix
					? [
							{
								key: `${seed.prefix}summary.csv`,
								size: 512,
								lastModified: now,
								etag: '"summary"',
							},
						]
					: []
				return {
					json: buildObjectsListFixture({
						bucket: seed.bucket,
						prefix,
						commonPrefixes: prefix ? [] : [seed.prefix],
						items,
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${seed.bucket}/objects/favorites`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				return {
					json: buildFavoritesFixture({
						bucket: seed.bucket,
						prefix: url.searchParams.get('prefix') ?? '',
						items: [],
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${seed.bucket}/objects/download-url`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				const key = url.searchParams.get('key') ?? 'download.bin'
				return {
					json: {
						url: `data:text/plain;charset=utf-8,${encodeURIComponent(`download:${key}`)}`,
					},
				}
			},
		},
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	], { status: 200, json: {} })
}

async function emulateSecureDirectoryPicker(page: Page, folderName = 'webview-downloads') {
	await page.addInitScript(({ selectedFolderName }) => {
		const createWritable = () => ({
			write: async () => {},
			close: async () => {},
			abort: async () => {},
		})
		const createFileHandle = (name: string) => ({
			kind: 'file',
			name,
			createWritable: async () => createWritable(),
		})
		const createDirectoryHandle = (name: string) => ({
			kind: 'directory',
			name,
			queryPermission: async () => 'granted',
			requestPermission: async () => 'granted',
			getDirectoryHandle: async (childName: string) => createDirectoryHandle(childName),
			getFileHandle: async (childName: string) => createFileHandle(childName),
		})

		Object.defineProperty(window, 'isSecureContext', {
			value: true,
			configurable: true,
		})
		Object.defineProperty(window, 'showDirectoryPicker', {
			value: async () => createDirectoryHandle(selectedFolderName),
			configurable: true,
		})
	}, { selectedFolderName: folderName })
}

async function emulateInsecureBrowser(page: Page) {
	await page.addInitScript(() => {
		Object.defineProperty(window, 'isSecureContext', {
			value: false,
			configurable: true,
		})

		Object.defineProperty(window, 'showDirectoryPicker', {
			value: async () => {
				throw new DOMException('Directory picker unavailable', 'SecurityError')
			},
			configurable: true,
		})

		if (navigator.clipboard) {
			Object.defineProperty(navigator.clipboard, 'writeText', {
				value: async () => {
					throw new DOMException('Clipboard access blocked', 'NotAllowedError')
				},
				configurable: true,
			})
		}

		Object.defineProperty(document, 'execCommand', {
			value: () => false,
			configurable: true,
		})
	})
}

async function openObjectsDownloadDrawer(page: Page) {
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
		timeout: webviewObjectsReadyTimeoutMs,
		maxAttempts: 3,
	})
	await page.keyboard.press('ControlOrMeta+K')
	const commands = page.getByRole('dialog', { name: 'Commands' })
	await commands.getByRole('combobox', { name: 'Command search' }).fill('Download to folder')
	await commands.getByRole('option', { name: 'Download to folder…' }).click()
	const dialog = page.getByRole('dialog', { name: 'Download to this device' })
	await expect(dialog).toBeVisible({ timeout: webviewJobsDrawerTimeoutMs })
	return dialog
}

test.describe('Webview environment and posture coverage', () => {
	test('jobs download drawer can queue a device download in a short landscape split-view posture', async ({ page }) => {
		test.setTimeout(webviewJobsDrawerTestTimeoutMs)
		await page.setViewportSize({ width: 780, height: 420 })
		await emulateSecureDirectoryPicker(page)
		await installWebviewFixtures(page)
		await seedStorage(page)

		const dialog = await openObjectsDownloadDrawer(page)
		const localFolderInput = dialog.getByPlaceholder('Select a folder…')
		await expect(dialog.getByText(`s3://${defaultStorage.bucket}/${defaultStorage.prefix}*`)).toBeVisible()
		await expect(dialog.getByText('Downloads objects to your device')).toBeVisible()
		await dialog.getByRole('button', { name: /^Browse/ }).click()
		await expect(localFolderInput).toHaveValue('webview-downloads')
		await expect(dialog.getByRole('button', { name: 'Start download' })).toBeEnabled()
		await dialog.getByRole('button', { name: 'Start download' }).click()
		await expect(dialog).toHaveCount(0)
		await expect(page.locator('.ant-message-notice').filter({ hasText: 'Downloaded summary.csv' })).toBeVisible({ timeout: 10_000 })
	})

	test('jobs download drawer warns when secure-context folder access is unavailable', async ({ page }) => {
		test.setTimeout(webviewJobsDrawerTestTimeoutMs)
		await emulateInsecureBrowser(page)
		await installWebviewFixtures(page)
		await seedStorage(page)

		const dialog = await openObjectsDownloadDrawer(page)

		await expect(dialog.getByText(localFolderAccessUnavailableTitle())).toBeVisible()
		await expect(dialog.getByText(directoryPickerInsecureOriginReason())).toBeVisible()
		await expect(dialog.getByRole('button', { name: /^Browse/ })).toBeDisabled()
		await expect(dialog.getByRole('button', { name: 'Start download' })).toBeDisabled()
	})

	test('objects copy-location feedback surfaces the insecure-origin clipboard hint', async ({ page }) => {
		test.setTimeout(webviewObjectsTestTimeoutMs)
		await emulateInsecureBrowser(page)
		await installWebviewFixtures(page)
		await seedStorage(page)

		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByPlaceholder('Search current folder'), {
			timeout: webviewObjectsReadyTimeoutMs,
			maxAttempts: 3,
		})
		await page.getByRole('button', { name: 'Copy location' }).click()

		await expect(page.locator('span').filter({ hasText: clipboardInsecureOriginHint() })).toBeVisible()
		await expect(page.getByText(`s3://${defaultStorage.bucket}/${defaultStorage.prefix}`)).toBeVisible()
	})
})
