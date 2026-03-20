import { expect, type Locator, type Page } from '@playwright/test'

export async function expectNoPageHorizontalOverflow(page: Page) {
	const metrics = await page.evaluate(() => ({
		innerWidth: window.innerWidth,
		scrollWidth: document.documentElement.scrollWidth,
	}))
	expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.innerWidth)
}

export async function expectLocatorWithinViewport(locator: Locator) {
	const metrics = await locator.evaluate((node) => {
		const rect = (node as HTMLElement).getBoundingClientRect()
		return {
			top: rect.top,
			left: rect.left,
			right: rect.right,
			bottom: rect.bottom,
			width: rect.width,
			height: rect.height,
			viewportWidth: window.innerWidth,
			viewportHeight: window.innerHeight,
		}
	})
	expect(metrics.left).toBeGreaterThanOrEqual(0)
	expect(metrics.top).toBeGreaterThanOrEqual(0)
	expect(metrics.right).toBeLessThanOrEqual(metrics.viewportWidth)
	expect(metrics.bottom).toBeLessThanOrEqual(metrics.viewportHeight)
	expect(metrics.width).toBeLessThanOrEqual(metrics.viewportWidth)
	expect(metrics.height).toBeLessThanOrEqual(metrics.viewportHeight)
}
