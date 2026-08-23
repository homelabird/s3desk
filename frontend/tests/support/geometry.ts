import { expect, type Locator, type Page, type TestInfo } from '@playwright/test'

export async function expectMinTouchTarget(locator: Locator, minSize = 44) {
	await expect
		.poll(() =>
			locator.evaluate((element) => {
				const { height, width } = element.getBoundingClientRect() // e2e-geometry-allow validates both touch-target dimensions in rendered Chromium
				return Math.min(height, width)
			}),
		)
		.toBeGreaterThanOrEqual(minSize)
}

export function getProjectViewport(testInfo: TestInfo) {
	const viewport = testInfo.project.use.viewport
	if (!viewport) throw new Error(`Project ${testInfo.project.name} must define a viewport`)
	return viewport
}

export async function restoreProjectViewport(page: Page, testInfo: TestInfo) {
	await page.setViewportSize(getProjectViewport(testInfo))
}
