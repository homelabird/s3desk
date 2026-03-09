import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	metaJson,
	seedLocalStorage,
} from './support/apiFixtures'

async function stubObjectsLayoutApi(page: Page) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson()),
		jsonFixture('GET', '/api/v1/profiles', [buildProfileFixture({ id: 'layout-profile' })]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture('layout-bucket')]),
		jsonFixture('GET', '/api/v1/buckets/layout-bucket/objects', buildObjectsListFixture({ bucket: 'layout-bucket' })),
		jsonFixture('GET', '/api/v1/buckets/layout-bucket/objects/favorites', buildFavoritesFixture({ bucket: 'layout-bucket' })),
	])
}

async function openObjectsPage(page: Page) {
	await seedLocalStorage(page, {
		objectsUIMode: 'advanced',
		apiToken: 'change-me',
		profileId: 'layout-profile',
		bucket: 'layout-bucket',
	})
	await page.goto('/objects')
	await expect(page.getByTestId('objects-list-controls-root')).toBeVisible()
}

test.describe('Objects layout density', () => {
	test('keeps the tree in drawer mode on medium desktop widths', async ({ page }) => {
		await page.setViewportSize({ width: 1280, height: 900 })
		await stubObjectsLayoutApi(page)
		await openObjectsPage(page)

		await expect(page.locator('[data-tree-docked="false"]').first()).toBeVisible()
		await expect(page.getByTestId('objects-list-controls-root')).toHaveAttribute('data-compact', 'false')
	})

	test('collapses empty favorites when the docked tree is visible on wider screens', async ({ page }) => {
		await page.setViewportSize({ width: 1760, height: 960 })
		await stubObjectsLayoutApi(page)
		await openObjectsPage(page)

		await expect(page.locator('[data-tree-docked="true"]').first()).toBeVisible()
		await expect(page.getByTestId('objects-favorites-pane')).toHaveAttribute('data-expanded', 'false')

		await page.getByRole('button', { name: 'Favorites' }).click()
		await expect(page.getByText('No favorites yet.')).toBeVisible()
	})
})
