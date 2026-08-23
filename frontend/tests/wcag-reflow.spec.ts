import { execFileSync } from 'node:child_process'

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
	clickBucketCardManageAction,
	dialogByName,
	gotoBucketsPage,
	gotoJobsPage,
	gotoProfilesPage,
	gotoUploadsPage,
	gotoWithDynamicImportRecovery,
	objectsListRow,
} from './support/ui'

const reflowViewport = { width: 320, height: 800 }
const browserUiZoom = process.env.PLAYWRIGHT_BROWSER_UI_ZOOM === '1'
const firefoxTextOnlyZoom = process.env.PLAYWRIGHT_FIREFOX_TEXT_ONLY_ZOOM === '1'
const firefoxFullPageZoom = process.env.PLAYWRIGHT_FIREFOX_FULL_PAGE_ZOOM === '1'
const actualBrowserZoom = browserUiZoom || firefoxTextOnlyZoom || firefoxFullPageZoom

async function applyBrowserZoom(page: Page) {
	if (!browserUiZoom && !firefoxTextOnlyZoom && !firefoxFullPageZoom) return

	const title = `s3desk-browser-zoom-${process.pid}-${Date.now()}`
	await page.evaluate((value) => { document.title = value }, title)
	await page.waitForTimeout(500)
	const windowId = execFileSync('xdotool', ['search', '--all', '--name', title], { encoding: 'utf8' })
		.trim()
		.split(/\s+/)[0]
	const sendKey = (key: string) => execFileSync(
		'xdotool',
		['key', '--window', windowId, '--clearmodifiers', key],
	)

	execFileSync('xdotool', ['windowfocus', '--sync', windowId])
	sendKey('ctrl+0')
	if (firefoxFullPageZoom) {
		execFileSync('xdotool', ['windowsize', '--sync', windowId, '1280', '800'])
		await expect.poll(() => page.evaluate(() => ({
			width: innerWidth,
			scale: devicePixelRatio,
		}))).toEqual({ width: 1280, scale: 1 })
	}
	if (firefoxTextOnlyZoom) {
		const baselineFontSize = await page.locator('body').evaluate((body) => {
			const textElement = [body, ...body.querySelectorAll<HTMLElement>('*')]
				.find((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
			return Number.parseFloat(getComputedStyle(textElement ?? body).fontSize)
		})
		for (let index = 0; index < 6; index += 1) sendKey('ctrl+plus')

		await expect.poll(() => page.locator('body').evaluate((body, baseline) => {
			const textElement = [body, ...body.querySelectorAll<HTMLElement>('*')]
				.find((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
			const fontSize = Number.parseFloat(getComputedStyle(textElement ?? body).fontSize)
			return {
				width: innerWidth,
				scale: devicePixelRatio,
				textScale: Math.round((fontSize / baseline) * 100),
			}
		}, baselineFontSize)).toEqual({ width: reflowViewport.width, scale: 1, textScale: 200 })
		return
	}

	const zoomIncrementCount = firefoxFullPageZoom ? 9 : 8
	for (let index = 0; index < zoomIncrementCount; index += 1) sendKey('ctrl+plus')

	await expect.poll(() => page.evaluate(() => ({
		width: innerWidth,
		scale: devicePixelRatio,
	}))).toEqual({ width: 320, scale: 4 })
}

async function expectFocusedAndUnobscured(locator: Locator) {
	await expect(locator).toBeFocused()
	await expect.poll(() => locator.evaluate((element) => {
		const rect = element.getBoundingClientRect() // e2e-geometry-allow verifies WCAG 2.4.11 focused content is not fully obscured
		let left = Math.max(0, rect.left)
		let right = Math.min(innerWidth, rect.right)
		let top = Math.max(0, rect.top)
		let bottom = Math.min(innerHeight, rect.bottom)
		for (let parent = element.parentElement; parent; parent = parent.parentElement) {
			const style = getComputedStyle(parent)
			const parentRect = parent.getBoundingClientRect() // e2e-geometry-allow intersects overflow clips with the focused control
			if (style.overflowX !== 'visible') {
				left = Math.max(left, parentRect.left)
				right = Math.min(right, parentRect.right)
			}
			if (style.overflowY !== 'visible') {
				top = Math.max(top, parentRect.top)
				bottom = Math.min(bottom, parentRect.bottom)
			}
		}
		const points = [
			[(left + right) / 2, (top + bottom) / 2],
			[left + 1, top + 1],
			[right - 1, top + 1],
			[left + 1, bottom - 1],
			[right - 1, bottom - 1],
		]
		if (right <= left || bottom <= top) return false
		return points.some(([x, y]) => {
			const hit = document.elementFromPoint(x, y)
			return hit === element || (hit !== null && (element.contains(hit) || hit.contains(element)))
		})
	})).toBe(true)
}

async function activate(locator: Locator) {
	await locator.focus()
	await expectFocusedAndUnobscured(locator)

	if (firefoxFullPageZoom) {
		// Playwright's Firefox pointer coordinates stay unscaled after native page zoom.
		await locator.press('Enter')
		return
	}
	await locator.click()
}

async function openPolicyEditorWithKeyboard(page: Page, manageTrigger: Locator) {
	await activate(manageTrigger)
	const menu = page.getByRole('menu').last()
	const controlsItem = menu.getByRole('menuitem', { name: 'Controls' })
	const policyItem = menu.getByRole('menuitem', { name: /Policy editor/ })
	await expectFocusedAndUnobscured(controlsItem)
	await controlsItem.press('ArrowDown')
	await expectFocusedAndUnobscured(policyItem)
	await policyItem.press('Enter')
}

async function traverseOverlayFocus(page: Page, scope: Locator, key: 'Tab' | 'Shift+Tab', steps: number) {
	for (let index = 0; index < steps; index += 1) {
		const focusedControl = scope.locator(':focus')
		await expect(focusedControl).toHaveCount(1)
		await expectFocusedAndUnobscured(focusedControl)
		await page.keyboard.press(key)
	}
}

async function reportPointerTargets(page: Page, surface: string) {
	const targets = await page.locator([
		'button',
		'a[href]',
		'input:not([type="hidden"]):not([aria-hidden="true"])',
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
	if (!firefoxTextOnlyZoom) {
		await page.evaluate(() => {
			const elements = [document.body, ...document.body.querySelectorAll<HTMLElement>('*')]
				.filter((element) => [...element.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim()))
			const fontSizes = elements.map((element) => Number.parseFloat(getComputedStyle(element).fontSize))
			elements.forEach((element, index) => {
				element.style.fontSize = `${fontSizes[index] * 2}px`
			})
		})
	}

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
			className: element.className,
			overflowingDescendants: [...element.querySelectorAll<HTMLElement>('*')]
				.map((descendant) => ({ descendant, width: descendant.getBoundingClientRect().width })) // e2e-geometry-allow reports the child causing clipped text
				.filter(({ descendant, width }) => width > element.clientWidth + 1 || descendant.scrollWidth > descendant.clientWidth + 1) // e2e-geometry-allow identifies the descendant that causes clipping
				.slice(0, 5)
				.map(({ descendant, width }) => ({
					tag: descendant.tagName,
					className: descendant.className,
					width: Math.round(width),
					scrollWidth: descendant.scrollWidth, // e2e-geometry-allow includes overflow evidence in the failure message
				})),
			client: `${element.clientWidth}x${element.clientHeight}`, // e2e-geometry-allow reports the clipped viewport
			scroll: `${element.scrollWidth}x${element.scrollHeight}`, // e2e-geometry-allow reports the full text extent
		}]
	}))
	expect(clippedText, `${surface} loses unlabeled text at simulated 200% text resize`).toEqual([])
}

test.describe('WCAG 1.4.10 reflow at 320 CSS px', () => {
	test.beforeEach(async ({ page }) => {
		if (!firefoxFullPageZoom) {
			await page.setViewportSize(browserUiZoom ? { width: 1280, height: 800 } : reflowViewport)
		}
	})

	test('Login reflows without losing authentication controls', async ({ page }) => {
		await seedLoginMobileResponsiveStorage(page, '')
		await installLoginMobileResponsiveFixtures(page, ['valid-token'])
		await gotoProfilesPage(page, { ready: (scope) => scope.getByRole('heading', { name: 'S3Desk' }) })
		await applyBrowserZoom(page)

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
		await applyBrowserZoom(page)

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
		await applyBrowserZoom(page)

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Buckets')
		await expectTwoHundredPercentTextResize(page, 'Buckets')
	})

	test('Objects and its view-options sheet reflow', async ({ page }) => {
		await installObjectsMobileResponsiveFixtures(page)
		await seedObjectsMobileResponsiveStorage(page)
		await gotoWithDynamicImportRecovery(page, '/objects', (scope) => scope.getByTestId('objects-list-controls-root'))
		await applyBrowserZoom(page)

		await expect(objectsListRow(page, 'alpha.txt')).toBeVisible()
		await expect(page.getByText(/a-very-long-object-key-that-should-wrap/).first()).toBeVisible()
		await expectPageReflow(page)

		await activate(page.getByRole('button', { name: /Filters|View|Filter/ }))
		const sheet = dialogByName(page, 'View options')
		await expect(sheet).toBeVisible()
		await expectContainedReflow(sheet)
		await reportPointerTargets(page, 'Objects with view options')
		await expectTwoHundredPercentTextResize(page, 'Objects with view options', sheet)
		await expectContainedReflow(sheet)
	})

	test('Bucket policy loading, long content, and validation errors reflow', async ({ page }) => {
		const bucketName = 'responsive-bucket'
		const longResource = `arn:aws:s3:::${bucketName}/${'nested-prefix/'.repeat(12)}${'object-key-'.repeat(12)}.json`
		const validationError = `Cross-account statement needs review: ${'external-principal-condition-'.repeat(10)}`
		let releasePolicy = () => undefined
		let releaseValidation = () => undefined
		const policyReleased = new Promise<void>((resolve) => { releasePolicy = resolve })
		const validationReleased = new Promise<void>((resolve) => { releaseValidation = resolve })
		await installProfilesBucketsMobileResponsiveFixtures(page, {
			profileProvider: 'aws_s3',
			bucketPolicy: {
				Version: '2012-10-17',
				Statement: [{
					Sid: 'LongCrossAccountObjectRead',
					Effect: 'Allow',
					Principal: { AWS: 'arn:aws:iam::123456789012:root' },
					Action: ['s3:GetObject'],
					Resource: longResource,
				}],
			},
		})
		await seedProfilesBucketsMobileResponsiveStorage(page, { bucket: bucketName })
		await page.route(`**/api/v1/buckets/${bucketName}/policy`, async (route) => {
			await policyReleased
			await route.fallback()
		})
		await page.route(`**/api/v1/buckets/${bucketName}/policy/validate`, async (route) => {
			await validationReleased
			await route.fulfill({
				status: 200,
				contentType: 'application/json',
				body: JSON.stringify({
					ok: false,
					provider: 'aws_s3',
					errors: [validationError],
					warnings: ['Confirm the intended account boundary before saving.'],
				}),
			})
		})
		await gotoBucketsPage(page)
		await applyBrowserZoom(page)

		const bucketCard = page.getByTestId('buckets-list-compact').locator('article').filter({ hasText: bucketName }).first()
		const manageTrigger = bucketCard.getByRole('button', { name: `Manage bucket ${bucketName}` })
		if (actualBrowserZoom) {
			await openPolicyEditorWithKeyboard(page, manageTrigger)
		} else {
			await clickBucketCardManageAction(page, bucketCard, bucketName, /Policy editor/)
		}
		const sheet = dialogByName(page, `Policy: ${bucketName}`)
		await expect(sheet.getByText('Loading…')).toBeVisible()
		await expectPageReflow(page)
		await expectContainedReflow(sheet)

		releasePolicy()
		await expect(sheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()
		if (actualBrowserZoom) {
			await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
			await traverseOverlayFocus(page, sheet, 'Tab', 16)
			await traverseOverlayFocus(page, sheet, 'Shift+Tab', 8)
			await page.keyboard.press('Escape')
			await expect(sheet).toHaveCount(0)
			await expectFocusedAndUnobscured(manageTrigger)
			await openPolicyEditorWithKeyboard(page, manageTrigger)
			await expect(sheet.getByTestId('bucket-policy-mobile-shell')).toBeVisible()
		}
		const rawPolicy = sheet.getByRole('textbox', { name: 'Raw policy JSON' })
		await expect(rawPolicy).toBeVisible()
		expect(await rawPolicy.inputValue()).toContain(longResource)

		const validateButton = sheet.getByRole('button', { name: 'Validate with provider' })
		await activate(validateButton)
		await expect(validateButton).toBeDisabled()
		await expectContainedReflow(sheet)
		releaseValidation()
		await expect(sheet.getByText('Server validation found issues')).toBeVisible()
		await expect(sheet.getByText(`Error: ${validationError}`)).toBeVisible()
		await expectPageReflow(page)
		await expectContainedReflow(sheet)
		await reportPointerTargets(page, 'Bucket policy editor')
		await expectTwoHundredPercentTextResize(page, 'Bucket policy editor', sheet)
		await expectContainedReflow(sheet)
	})

	test('Uploads reflows without losing its primary action', async ({ page }) => {
		await installUploadsMobileResponsiveFixtures(page)
		await seedUploadsMobileResponsiveStorage(page)
		await gotoUploadsPage(page)
		await applyBrowserZoom(page)

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
		await applyBrowserZoom(page)

		await expect(page.getByText('job-queued')).toBeVisible()
		const filtersTrigger = page.getByTestId('jobs-mobile-filters-trigger')
		await expect(filtersTrigger).toBeVisible()
		if (actualBrowserZoom) {
			await activate(filtersTrigger)
			const sheet = page.getByTestId('jobs-mobile-filters-sheet')
			await expect(sheet).toBeVisible()
			await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
			await traverseOverlayFocus(page, sheet, 'Tab', 10)
			await traverseOverlayFocus(page, sheet, 'Shift+Tab', 6)
			await page.keyboard.press('Escape')
			await expect(sheet).toHaveCount(0)
			await expectFocusedAndUnobscured(filtersTrigger)
		}
		await expectPageReflow(page)
		await reportPointerTargets(page, 'Jobs')
		await expectTwoHundredPercentTextResize(page, 'Jobs')
	})

	test('Settings drawer reflows and keeps all sections reachable', async ({ page }) => {
		await installSettingsMobileResponsiveFixtures(page)
		await seedSettingsMobileResponsiveStorage(page)
		await page.goto('/settings')
		await applyBrowserZoom(page)

		const drawer = dialogByName(page, 'Settings')
		await expect(drawer).toBeVisible()
		const supportTab = drawer.getByRole('tab', { name: 'Support' })
		await expect(supportTab).toBeVisible()
		if (actualBrowserZoom) {
			const settingsTabs = ['Access', 'Objects', 'Transfers', 'Support'].map((name) => drawer.getByRole('tab', { name }))
			await settingsTabs[0].focus()
			for (const [index, tab] of settingsTabs.entries()) {
				await expectFocusedAndUnobscured(tab)
				if (index < settingsTabs.length - 1) await tab.press('ArrowRight')
			}
			await expect(supportTab).toHaveAttribute('aria-selected', 'true')
		} else {
			await activate(supportTab)
		}
		await expect(drawer.getByText('Browser recovery')).toBeVisible()
		await activate(drawer.getByRole('button', { name: 'Server and backup' }))
		await expect(drawer.getByText('Runtime diagnostics')).toBeVisible()
		await expectPageReflow(page)
		await expectContainedReflow(drawer)
		await reportPointerTargets(page, 'Settings')
		await expectTwoHundredPercentTextResize(page, 'Settings', drawer)
		await expectContainedReflow(drawer)
	})
})
