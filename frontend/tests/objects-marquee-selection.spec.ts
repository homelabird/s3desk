import { expect, test } from '@playwright/test'

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
import { gotoWithDynamicImportRecovery } from './support/ui'

const profileId = 'marquee-profile'
const bucket = 'marquee-bucket'
const items = Array.from({ length: 60 }, (_, index) => ({
	key: `file-${String(index + 1).padStart(2, '0')}.txt`,
	size: index + 1,
	lastModified: '2024-01-01T00:00:00Z',
}))

test('selects objects with a Windows-style marquee and auto-scrolls at the viewport edge', async ({ page }) => {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', buildMetaFixture()),
		jsonFixture('GET', '/api/v1/profiles', [buildProfileFixture({ id: profileId })]),
		jsonFixture('GET', '/api/v1/buckets', [buildBucketFixture(bucket)]),
		jsonFixture('GET', new RegExp(`/api/v1/buckets/${bucket}/objects(?:\\?.*)?$`), buildObjectsListFixture({ bucket, items })),
		jsonFixture('GET', `/api/v1/buckets/${bucket}/objects/favorites`, { bucket, prefix: '', items: [] }),
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403 }),
	])
	await seedLocalStorage(page, {
		apiToken: 'marquee-token',
		profileId,
		bucket,
		prefix: '',
		objectsUIMode: 'advanced',
		objectsViewMode: 'grid',
	})
	await page.setViewportSize({ width: 1440, height: 850 })
	await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-grid-content'))

	const grid = page.getByTestId('objects-grid-content')
	const cards = grid.locator('[data-object-key]')
	await expect(cards.first()).toBeVisible()
	const gridBox = await grid.boundingBox() // e2e-geometry-allow supplies the marquee drag start within the rendered grid
	const secondBox = await cards.nth(1).boundingBox() // e2e-geometry-allow supplies the marquee drag end across the second rendered card
	if (!gridBox || !secondBox) throw new Error('missing grid geometry')

	await page.mouse.move(gridBox.x + 2, gridBox.y + 2)
	await page.mouse.down()
	await page.mouse.move(secondBox.x + secondBox.width - 2, secondBox.y + secondBox.height - 2, { steps: 8 })
	await expect(page.getByTestId('objects-marquee-selection')).toBeVisible()
	await expect(page.getByTestId('objects-selection-bar')).toContainText('2 selected')
	await page.mouse.up()
	await expect(page.getByTestId('objects-marquee-selection')).toHaveCount(0)

	const appScroller = page.locator('[data-scroll-container="app-content"]')
	const before = await appScroller.evaluate((element) => element.scrollTop)
	await page.mouse.move(gridBox.x + 2, gridBox.y + 2)
	await page.mouse.down()
	await page.mouse.move(gridBox.x + gridBox.width - 4, 846, { steps: 10 })
	await page.waitForTimeout(600)
	await expect.poll(() => appScroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(before)
	await page.mouse.up()
	await expect(page.getByTestId('objects-selection-bar')).toContainText(/selected/)
})
