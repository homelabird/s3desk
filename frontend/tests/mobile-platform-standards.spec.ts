import { expect, test, type Page } from '@playwright/test'

import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { gotoProfilesPage } from './support/ui'

async function setupProfilesPage(page: Page) {
	await installProfilesBucketsMobileResponsiveFixtures(page)
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await gotoProfilesPage(page)
}

test.describe('@mobile-responsive Apple and Google mobile web standards', () => {
	test('keeps standards metadata and user zoom enabled', async ({ page }) => {
		await setupProfilesPage(page)

		const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
		expect(viewport).toContain('width=device-width')
		expect(viewport).toMatch(/initial-scale=1(?:\.0)?/)
		expect(viewport).toContain('viewport-fit=cover')
		expect(viewport).not.toMatch(/user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i)
		await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', /\S+/)
		expect(await page.evaluate(() => navigator.maxTouchPoints)).toBeGreaterThan(0)
	})

	test('keeps primary chrome inside emulated display safe areas', async ({ page }) => {
		const session = await page.context().newCDPSession(page)
		await session.send('Emulation.setSafeAreaInsetsOverride', {
			insets: {
				top: 44,
				topMax: 44,
				right: 24,
				rightMax: 24,
				bottom: 34,
				bottomMax: 34,
				left: 24,
				leftMax: 24,
			},
		})
		await setupProfilesPage(page)

		const safeArea = await page.getByTestId('app-header').evaluate((header) => {
			const headerStyle = getComputedStyle(header)
			const contentStyle = getComputedStyle(document.querySelector('#main')?.parentElement ?? header)
			const mainStyle = getComputedStyle(document.querySelector('#main') ?? header)
			return {
				headerTop: Number.parseFloat(headerStyle.paddingTop),
				headerLeft: Number.parseFloat(headerStyle.paddingLeft),
				headerRight: Number.parseFloat(headerStyle.paddingRight),
				contentLeft: Number.parseFloat(contentStyle.paddingLeft),
				contentRight: Number.parseFloat(contentStyle.paddingRight),
				mainBottom: Number.parseFloat(mainStyle.paddingBottom),
			}
		})
		console.log(`[safe-area-audit] ${JSON.stringify(safeArea)}`)
		const hiddenSkipLinkBottom = await page.getByRole('link', { name: 'Skip to content' }).evaluate((link) =>
			link.getBoundingClientRect().bottom, // e2e-geometry-allow verifies the safe-area offset does not expose the hidden skip link
		)

		expect(hiddenSkipLinkBottom).toBeLessThanOrEqual(0)
		expect(safeArea.headerTop).toBeGreaterThanOrEqual(44)
		expect(safeArea.headerLeft).toBeGreaterThanOrEqual(24)
		expect(safeArea.headerRight).toBeGreaterThanOrEqual(24)
		expect(safeArea.contentLeft).toBeGreaterThanOrEqual(24)
		expect(safeArea.contentRight).toBeGreaterThanOrEqual(24)
		expect(safeArea.mainBottom).toBeGreaterThanOrEqual(34)
	})

	test('honors the mobile reduced-motion preference', async ({ page }) => {
		await page.emulateMedia({ reducedMotion: 'reduce' })
		await setupProfilesPage(page)

		expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
		const activeMotion = await page.locator('body *').evaluateAll((elements) => {
			const milliseconds = (value: string) => value.split(',').map((duration) => {
				const parsed = Number.parseFloat(duration)
				return duration.trim().endsWith('ms') ? parsed : parsed * 1000
			})
			return elements.flatMap((element) => {
				const style = getComputedStyle(element)
				const longest = Math.max(...milliseconds(style.animationDuration), ...milliseconds(style.transitionDuration))
				return longest > 1 ? [{ tag: element.tagName, durationMs: longest }] : []
			})
		})
		expect(activeMotion).toEqual([])
	})

	test('preserves the primary workflow after rotating to landscape', async ({ page }) => {
		await page.setViewportSize({ width: 844, height: 390 })
		await setupProfilesPage(page)

		expect(await page.evaluate(() => matchMedia('(orientation: landscape)').matches)).toBe(true)
		await expect(page.getByRole('heading', { name: 'Profiles' })).toBeVisible()
		await expect(page.getByRole('button', { name: 'New Profile' })).toBeVisible()
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)) // e2e-geometry-allow verifies landscape viewport reflow after rotation
			.toBe(true)
	})
})
