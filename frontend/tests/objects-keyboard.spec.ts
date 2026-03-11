import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	seedLocalStorage,
} from './support/apiFixtures'
import { dialogByName } from './support/ui'

const profileId = 'playwright-keyboard-profile'
const bucket = 'keyboard-bucket'
const now = '2024-01-01T00:00:00Z'
const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'

type ObjectsPageFixture = {
	commonPrefixes?: string[]
	items?: Array<{
		key: string
		size: number
		lastModified: string
		etag: string
	}>
}

const objectsByPrefix: Record<string, ObjectsPageFixture> = {
	'': {
		items: [
			{ key: 'alpha.txt', size: 11, lastModified: now, etag: '"alpha"' },
			{ key: 'beta.txt', size: 22, lastModified: now, etag: '"beta"' },
			{ key: 'gamma.txt', size: 33, lastModified: now, etag: '"gamma"' },
		],
	},
	'docs/': {
		commonPrefixes: ['docs/reports/'],
		items: [{ key: 'docs/overview.txt', size: 44, lastModified: now, etag: '"overview"' }],
	},
	'docs/reports/': {
		items: [{ key: 'docs/reports/q1.txt', size: 55, lastModified: now, etag: '"q1"' }],
	},
}

async function seedStorage(page: Page, overrides: Record<string, unknown> = {}) {
	await seedLocalStorage(page, {
		apiToken: 'playwright-token',
		profileId,
		bucket,
		prefix: '',
		objectsUIMode: 'advanced',
		...overrides,
	})
}

async function installObjectsKeyboardApi(page: Page) {
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
						name: 'Keyboard Profile',
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
				const pageFixture = objectsByPrefix[prefix] ?? { items: [] }
				return {
					json: buildObjectsListFixture({
						bucket,
						prefix,
						commonPrefixes: pageFixture.commonPrefixes ?? [],
						items: pageFixture.items ?? [],
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: () => ({ json: buildFavoritesFixture({ bucket }) }),
		},
	])
}

test.describe('Objects keyboard interactions', () => {
	test('selection shortcuts cover range select, select all, clear, and rename', async ({ page }) => {
		await installObjectsKeyboardApi(page)
		await seedStorage(page)
		await page.goto('/objects')

		const list = page.getByRole('list', { name: 'Objects list' })
		await expect(list).toBeVisible()
		await list.focus()

		await list.press('F2')
		await expect(page.locator('span').filter({ hasText: 'Select a single object to rename' })).toBeVisible()

		await list.press('ArrowDown')
		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeChecked()
		await expect(page.getByText('1 selected')).toBeVisible()

		await list.press('Shift+ArrowDown')
		await expect(page.getByText('2 selected')).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeChecked()
		await expect(page.getByRole('checkbox', { name: 'Select beta.txt' })).toBeChecked()

		await list.press(`${modifier}+A`)
		await expect(page.getByText('3 selected')).toBeVisible()
		await expect(page.getByRole('checkbox', { name: 'Select gamma.txt' })).toBeChecked()

		await list.press('Escape')
		await expect(page.getByText('3 selected')).toHaveCount(0)
		await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).not.toBeChecked()

		await list.press('ArrowDown')
		await list.press('F2')
		const renameDialog = dialogByName(page, 'Rename object…')
		await expect(renameDialog).toBeVisible()
		await expect(renameDialog.getByText(`s3://${bucket}/alpha.txt`)).toBeVisible()
	})

	test('backspace navigates to the parent prefix', async ({ page }) => {
		await installObjectsKeyboardApi(page)
		await seedStorage(page, { prefix: 'docs/reports/' })
		await page.goto('/objects')

		await expect(page.getByText(`s3://${bucket}/docs/reports/`)).toBeVisible()
		await expect(page.getByText('q1.txt')).toBeVisible()

		const list = page.getByRole('list', { name: 'Objects list' })
		await expect(list).toBeVisible()
		await list.press('Backspace')

		await expect(page.getByText(`s3://${bucket}/docs/`)).toBeVisible()
		await expect(page.getByText('overview.txt')).toBeVisible()
	})
})
