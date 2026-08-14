import { expect, test, type Locator, type Page } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { installObjectsMobileResponsiveFixtures, seedObjectsMobileResponsiveStorage } from './support/objectsMobileResponsive'
import {
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import {
	installLoginMobileResponsiveFixtures,
	installSettingsMobileResponsiveFixtures,
	seedLoginMobileResponsiveStorage,
	seedSettingsMobileResponsiveStorage,
} from './support/settingsLoginMobileResponsive'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'
import {
	dialogByName,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoUploadsPage,
	gotoWithDynamicImportRecovery,
	objectsListRow,
} from './support/ui'

const reflowViewport = { width: 320, height: 800 }

async function reportPointerTargets(page: Page, surface: string) {
	const targets = await page.locator([
		'button',
		'a[href]',
		'input:not([type="hidden"])',
		'select',
		'textarea',
		'[role="button"]',
		'[role="tab"]',
		'[role="menuitem"]',
		'[role="checkbox"]',
		'[role="switch"]',
	].join(',')).evaluateAll((elements) => elements.flatMap((element) => {
		const wrapper = element.closest([
			'label',
			'.ant-input-affix-wrapper',
			'.ant-input-number',
			'.ant-checkbox-wrapper',
			'.ant-radio-wrapper',
			'.ant-select-selector',
		].join(','))
		const ownRect = element.getBoundingClientRect() // e2e-geometry-allow measures the actual pointer target
		const wrapperRect = wrapper?.getBoundingClientRect() // e2e-geometry-allow includes label and control wrappers
		const rect = wrapperRect && wrapperRect.width * wrapperRect.height > ownRect.width * ownRect.height
			? wrapperRect
			: ownRect
		const style = getComputedStyle(element)
		if (rect.width <= 0 || rect.height <= 0 || rect.bottom <= 0 || style.visibility === 'hidden' || style.pointerEvents === 'none') return []
		return [{
			name: element.getAttribute('aria-label') || element.textContent?.trim().replace(/\s+/g, ' ').slice(0, 60) || element.tagName,
			width: Math.round(rect.width * 10) / 10,
			height: Math.round(rect.height * 10) / 10,
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2,
			inline: element.matches('a[href]') && ['inline', 'inline-block'].includes(style.display),
		}]
	}))

	const below = (size: number) => targets.filter((target) => target.width < size || target.height < size)
	const summarize = (size: number) => {
		const matches = below(size)
		return { count: matches.length, examples: matches.slice(0, 8) }
	}
	console.log(`[target-audit] ${surface} ${JSON.stringify({
		total: targets.length,
		below24: summarize(24),
		below44: summarize(44),
		below48: summarize(48),
	})}`)

	const unexplainedBelow24 = below(24).filter((target) => {
		if (target.inline) return false
		return targets.some((other) => other !== target && Math.hypot(other.x - target.x, other.y - target.y) < 24)
	})
	expect(unexplainedBelow24, `${surface} has WCAG 2.5.8 targets without an inline or spacing exception`).toEqual([])
	expect(
		below(48).filter((target) => !target.inline),
		`${surface} has touch targets below the shared Apple and Google 48px floor`,
	).toEqual([])
}

async function expectPageReflow(page: Page) {
	await expect
		.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)) // e2e-geometry-allow verifies 320px page reflow
		.toBe(true) // e2e-geometry-allow verifies WCAG 1.4.10 page reflow at 320 CSS px
}

async function expectContainedReflow(locator: Locator) {
	await expect
		.poll(() => locator.evaluate((element) => {
			const rect = element.getBoundingClientRect() // e2e-geometry-allow bounds overlay reflow to the viewport
			return (
				element.scrollWidth <= element.clientWidth + 1 // e2e-geometry-allow verifies contained overlay reflow
				&& rect.left >= -1
				&& rect.right <= window.innerWidth + 1
			)
		}))
		.toBe(true) // e2e-geometry-allow verifies overlay content does not require page-level horizontal scrolling
}

async function expectTwoHundredPercentTextResize(page: Page, surface: string, activeSurface = page.locator('body')) {
	await page.evaluate(() => {
		const elements = [document.body, ...document.body.querySelectorAll<HTMLElement>('*')]
			.filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
		const fontSizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
		elements.forEach((element, index) => {
			element.style.fontSize = `${fontSizes[index] * 2}px`
		})
	})

	await expectPageReflow(page)
	const clippedText = await activeSurface.locator('*').evaluateAll((elements) => elements.flatMap((element) => {
		if (!(element instanceof HTMLElement) || !element.textContent?.trim()) return []
		const rect = element.getBoundingClientRect() // e2e-geometry-allow ignores non-rendered text
		const style = getComputedStyle(element)
		if (rect.width <= 0 || rect.height <= 0 || style.visibility === 'hidden') return []
		const clipsHorizontally = ['hidden', 'clip'].includes(style.overflowX) && element.scrollWidth > element.clientWidth + 1 // e2e-geometry-allow detects text loss after resize
		const clipsVertically = ['hidden', 'clip'].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1 // e2e-geometry-allow detects text loss after resize
		if (!clipsHorizontally && !clipsVertically) return []
		if (element.getAttribute('aria-label') || element.getAttribute('title')) return []
		return [{
			name: element.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
			tag: element.tagName,
			client: `${element.clientWidth}x${element.clientHeight}`, // e2e-geometry-allow reports the clipped viewport
			scroll: `${element.scrollWidth}x${element.scrollHeight}`, // e2e-geometry-allow reports the full text extent
		}]
	}))
	expect(clippedText, `${surface} loses unlabeled text at simulated 200% text resize`).toEqual([])
}

test.describe('WCAG 1.4.10 reflow at 320 CSS px', () => {
	test.beforeEach(async ({ page }) => {
		await page.setViewportSize(reflowViewport)
	})

	test('Login reflows without losing authentication controls', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })

		await expect(page.getByPlaceholder('API_TOKEN')).toBeVisible()
		await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Login')
		await expectTwoHundredPercentTextResize(page, 'Login')
	})

	test('Profiles reflows to compact cards', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoProfilesPage(page)

		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expectPageReflow(page)
		const initialUrl = page.url()
		await page.keyboard.press('?')
		await page.keyboard.press('g')
		await page.keyboard.press('p')
		expect(page.url()).toBe(initialUrl)
		await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0)
		await reportPointerTargets(page, 'Profiles')
		await expectTwoHundredPercentTextResize(page, 'Profiles')
	})

	test('Buckets reflows to compact cards', async ({ page }) => {
		await installProfilesBucketsMobileResponsiveFixtures(page)
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await gotoBucketsPage(page)

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Buckets')
		await expectTwoHundredPercentTextResize(page, 'Buckets')
	})

	test('Objects and its view-options sheet reflow', async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'))

		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await expectPageReflow(page)

		await page.getByRole('button', { name: /Filters|View|Filter/ }).click()
		const sheet = dialogByName(page, 'View options')
		await expect(sheet).toBeVisible()
		await expectContainedReflow(sheet)
		await reportPointerTargets(page, 'Objects with view options')
		await expectTwoHundredPercentTextResize(page, 'Objects with view options', sheet)
		await expectContainedReflow(sheet)
	})

	test('Uploads reflows without losing its primary action', async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
		await gotoUploadsPage(page)

		await expect(page.getByRole('button', { name: /Add from device/i })).toBeVisible()
		await expect(page.getByLabel('Upload prefix (optional)')).toBeVisible()
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Uploads')
		await expectTwoHundredPercentTextResize(page, 'Uploads')
	})

	test('Jobs reflows without losing filters and queue content', async ({ page }) => {
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await gotoJobsPage(page)

		await expect(page.getByText('job-queued')).toBeVisible()
		await expect(page.getByTestId('jobs-mobile-filters-trigger')).toBeVisible()
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Jobs')
		await expectTwoHundredPercentTextResize(page, 'Jobs')
	})

	test('Settings drawer reflows and keeps all sections reachable', async ({ page }) => {
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.goto('/settings')

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		const supportTab = drawer.getByRole('tab', { name: 'Support' })
		await expect(supportTab).toBeVisible()
		await supportTab.click()
		await expect(drawer.getByText('Browser recovery')).toBeVisible()
		await drawer.getByRole('button', { name: 'Server and backup' }).click()
		await expect(drawer.getByText('Runtime diagnostics')).toBeVisible()
		await expectPageReflow(page)
		await expectContainedReflow(drawer)
		await reportPointerTargets(page, 'Settings')
		await expectTwoHundredPercentTextResize(page, 'Settings', drawer)
		await expectContainedReflow(drawer)
	})
})
