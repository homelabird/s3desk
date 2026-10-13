import { expect, test } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installObjectsMobileResponsiveFixtures } from './support/objectsMobileResponsive'
import { gotoWithDynamicImportRecovery } from './support/ui'

const folderName = 'this-folder-name-is-deliberately-long-enough-to-overflow-the-mobile-layout'
const prefix = `team/reports/${folderName}/`

for (const width of [320, 768, 1440]) {
	test(`long folder breadcrumbs reflow and navigate at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 900 })
		await installObjectsMobileResponsiveFixtures(page)
		await seedLocalStorage(page, {
			apiToken: 'objects-mobile-token', profileId: 'objects-mobile-profile',
			bucket: 'objects-mobile-bucket', prefix, objectsUIMode: 'advanced', objectsDetailsOpen: false,
		})
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'))
		const breadcrumb = page.getByRole('navigation', { name: 'Location breadcrumb' })
		const currentFolder = breadcrumb.getByRole('button', { name: `${folderName}/`, exact: true })
		await expect(currentFolder).toHaveAttribute('aria-current', 'location')
		await expect(currentFolder).toBeInViewport({ ratio: 1 })
		const geometry = await currentFolder.evaluate((element) => ({
			right: element.getBoundingClientRect().right, // e2e-geometry-allow proves the entire folder button fits the viewport
			viewportWidth: window.innerWidth,
			scrollWidth: element.scrollWidth, // e2e-geometry-allow detects text clipped inside the folder button
			clientWidth: element.clientWidth, // e2e-geometry-allow compares text width against the actual button width
		}))
		expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth)
			expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth + 1) // e2e-geometry-allow asserts folder text reflows inside its button
		await currentFolder.focus()
		await expect(currentFolder).toHaveCSS('outline-style', 'solid')
		await expect(currentFolder).toHaveCSS('outline-width', '2px')

		if (width < 768) {
			const parents = breadcrumb.getByRole('button', { name: 'Parent folders' })
			await parents.click()
			await expect(parents).toHaveAttribute('aria-expanded', 'true')
			await page.getByRole('menuitem', { name: 'reports/', exact: true }).click()
		} else {
			await breadcrumb.getByRole('button', { name: 'reports/', exact: true }).click()
		}
		await expect(breadcrumb.getByRole('button', { name: 'reports/', exact: true })).toHaveAttribute('aria-current', 'location')
		await expect(currentFolder).toHaveCount(0)
		await breadcrumb.getByRole('button', { name: '(root)', exact: true }).click()
		if (width < 1440) await expect(breadcrumb).toHaveCount(0)
		else await expect(breadcrumb.getByRole('button', { name: '(root)', exact: true })).toHaveAttribute('aria-current', 'location')
	})
}
