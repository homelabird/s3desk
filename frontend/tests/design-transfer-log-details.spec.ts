import { expect, test, type Route } from '@playwright/test'

import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { dialogByName, gotoJobsPage } from './support/ui'

for (const width of [320, 1280]) {
	test(`unknown download totals avoid a fabricated percentage at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await page.route('**/api/v1/jobs?**', route => route.fulfill({ json: {
			items: [{ id: 'job-unknown', type: 's3_zip_objects', status: 'succeeded', payload: { bucket: 'jobs-mobile-bucket', keys: ['annual.csv'] }, progress: null, createdAt: '2024-01-01T00:00:00Z', startedAt: null, finishedAt: '2024-01-01T00:00:10Z', error: null }], nextCursor: null,
		} }))
		let captureRoute: (route: Route) => void = () => {}
		const pendingLink = new Promise<Route>(resolve => { captureRoute = resolve })
		await page.route('**/api/v1/jobs/job-unknown/artifact-url', route => { captureRoute(route) })
		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Actions for job job-unknown', exact: true }).click()
		await page.getByRole('menuitem', { name: 'Download ZIP for job job-unknown', exact: true }).click()
		const drawer = dialogByName(page, 'Transfers')
		const row = drawer.getByTestId('transfer-download-row')
		await expect(row.getByText('Downloading', { exact: true })).toBeVisible()
		const route = await pendingLink
		await row.screenshot({ path: testInfo.outputPath('download-unknown-total.png'), animations: 'disabled' })
		await expect.soft(row.getByRole('progressbar')).toHaveCount(0)
		await expect.soft(row.getByText('0%', { exact: true })).toHaveCount(0)
		await expect.soft(row.getByText(/Total size unknown/)).toBeVisible()
		await route.fulfill({ json: { url: 'http://127.0.0.1:18881/synthetic-download.zip', expiresAt: new Date(Date.now() + 300_000).toISOString() } })
		await expect(row.getByText('Ready to save', { exact: true })).toBeVisible()
		await expect(row.getByRole('link', { name: /^Save download Artifact:/ })).toBeVisible()
	})

	test(`log exports describe the retained output at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		const logText = Array.from({ length: 2005 }, (_, index) => `[info] retained line ${index + 1}`).join('\n') + '\n'
		await page.route('**/api/v1/jobs/job-running/logs**', route => route.fulfill({
			contentType: 'text/plain', headers: { 'X-Log-Next-Offset': String(logText.length) }, body: logText,
		}))
		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Logs for job job-running', exact: true }).click()
		const drawer = dialogByName(page, 'Job Logs')
		await expect(drawer.getByRole('textbox', { name: 'Search logs', exact: true })).toBeVisible()
		await drawer.getByRole('switch', { name: 'Follow job logs' }).uncheck()
		await drawer.screenshot({ path: testInfo.outputPath('logs-retained-output.png'), animations: 'disabled' })
		await expect.soft(drawer.getByText('Loaded lines: 2,000', { exact: true })).toBeVisible()
		await expect.soft(drawer.getByRole('button', { name: /Copy loaded$/ })).toBeVisible()
		await expect.soft(drawer.getByRole('button', { name: 'Download loaded', exact: true })).toBeVisible()
		await expect.soft(drawer.getByRole('button', { name: /Copy all$/ })).toHaveCount(0)
		await drawer.getByRole('textbox', { name: 'Search logs', exact: true }).fill('retained line 2005')
		await expect(drawer.getByText('retained line 2005', { exact: true })).toBeVisible()
		await expect(drawer.getByRole('button', { name: /Copy visible$/ })).toBeVisible()
		await expect(drawer.getByRole('button', { name: 'Download visible', exact: true })).toBeVisible()
	})
}
