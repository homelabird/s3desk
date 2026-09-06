import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

import { expectMinTouchTarget } from './support/geometry'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { addUploadSourceFromDevice } from './support/ui'
import { installUploadsMobileResponsiveFixtures, seedUploadsMobileResponsiveStorage } from './support/uploadsMobileResponsive'

for (const width of [1280, 320]) {
	for (const screen of ['Buckets', 'Uploads']) {
		test(`${screen} retries a failed bucket list without leaving the page at ${width}px`, async ({ page }, testInfo) => {
			await page.setViewportSize({ width, height: 800 })
			await seedUploadsMobileResponsiveStorage(page)
			await installUploadsMobileResponsiveFixtures(page)
			let recover = false
			let requests = 0
			let releaseRetry!: () => void
			const retryResponse = new Promise<void>((resolve) => { releaseRetry = resolve })
			await page.route('**/api/v1/buckets', async (route) => {
				requests += 1
				if (!recover) {
					await route.fulfill({ status: 503, json: { error: { code: 'unavailable', message: 'Bucket list temporarily unavailable.' } } })
					return
				}
				await retryResponse
				await route.fulfill({ json: [{ name: 'uploads-mobile-bucket', createdAt: '2024-01-01T00:00:00Z' }] })
			})
			await page.goto(`/${screen.toLowerCase()}`)
			await expect(page.getByText('Failed to load buckets', { exact: true })).toBeVisible()
			if (screen === 'Uploads') {
				await page.getByLabel('Upload prefix (optional)').fill('keep-this-prefix/')
				await addUploadSourceFromDevice(page, { name: 'keep-this-file.txt', mimeType: 'text/plain', buffer: Buffer.from('keep') })
			}
			const retry = page.getByRole('button', { name: 'Retry loading buckets' })
			await expect(retry).toBeVisible()
			if (width === 320) await expectMinTouchTarget(retry)
			expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([])
			await page.screenshot({ path: testInfo.outputPath('bucket-list-error.png'), fullPage: true })
			const beforeRetry = requests
			recover = true
			try {
				await retry.focus()
				await page.keyboard.press('Enter')
				await expect.poll(() => requests).toBe(beforeRetry + 1)
				await expect(retry).toHaveCount(0)
				if (screen === 'Buckets') {
					await expect(page.getByRole('status', { name: 'Loading buckets' })).toBeVisible()
				} else {
					await expect(page.getByRole('combobox', { name: 'Bucket', exact: true })).toBeDisabled()
				}
				await expect(page.getByText('Your S3Desk workspace has no buckets yet.')).toHaveCount(0)
			} finally {
				releaseRetry()
			}
			await expect(page.getByText('Failed to load buckets', { exact: true })).toHaveCount(0)
			await expect(page.getByRole('alert').filter({ hasText: /Auto-retry|Retrying request/ })).toHaveCount(0)
			if (screen === 'Uploads') {
				await expect(page.getByLabel('Upload prefix (optional)')).toHaveValue('keep-this-prefix/')
				await expect(page.getByText('keep-this-file.txt', { exact: true })).toBeVisible()
				await expect(page.getByRole('button', { name: 'Queue upload (1)', exact: true })).toBeEnabled()
			} else {
				await expect(page.getByRole('button', { name: 'Open objects for bucket uploads-mobile-bucket' })).toBeVisible()
			}
		})
	}

	test(`Activity distinguishes a failed request from empty history and recovers at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ width, height: 800 })
		await seedJobsMobileResponsiveStorage(page)
		await page.addInitScript(() => window.localStorage.setItem('apiRetryCount', '0'))
		await installJobsMobileResponsiveFixtures(page)
		let recover = false
		await page.route('**/api/v1/jobs?*', async (route) => {
			await route.fulfill(recover
				? { json: { items: [], nextCursor: null } }
				: { status: 503, json: { error: { code: 'unavailable', message: 'Job list temporarily unavailable.' } } })
		})
		await page.goto('/jobs')
		await expect(page.getByText('Failed to load jobs', { exact: true })).toBeVisible({ timeout: 15_000 })
		await expect(page.getByText('No activity yet.', { exact: true })).toHaveCount(0)
		await expect(page.getByText('Activity could not be loaded.', { exact: true })).toBeVisible()
		recover = true
		await page.getByRole('button', { name: /Refresh/ }).click()
		await expect(page.getByText('Failed to load jobs', { exact: true })).toHaveCount(0)
		await expect(page.getByText('No activity yet.', { exact: true })).toBeVisible()
	})
}
