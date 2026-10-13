import { expect, test, type Route } from '@playwright/test'

import { seedLocalStorage } from './support/apiFixtures'
import { installJobsMobileResponsiveFixtures, seedJobsMobileResponsiveStorage } from './support/jobsMobileResponsive'
import { gotoJobsPage } from './support/ui'

for (const width of [320, 1280]) {
	test(`job logs keep their target and first-load status clear at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		let captureRoute: (route: Route) => void = () => {}
		const pendingLogRoute = new Promise<Route>(resolve => { captureRoute = resolve })
		await page.route('**/api/v1/jobs/job-running/logs**', route => { captureRoute(route) })
		await gotoJobsPage(page)
		await page.getByRole('button', { name: 'Logs for job job-running', exact: true }).click()
		const drawer = page.getByRole('dialog', { name: 'Job Logs', exact: true })
		const route = await pendingLogRoute
		await drawer.screenshot({ path: testInfo.outputPath('job-logs-loading.png'), animations: 'disabled' })
		await expect(drawer.getByText('job-running', { exact: true })).toBeVisible()
		await expect(drawer.getByRole('status', { name: 'Loading job logs' })).toBeVisible()
		await expect(drawer.getByText(/No log output was recorded/)).toHaveCount(0)
		await route.fulfill({ contentType: 'text/plain', headers: { 'X-Log-Next-Offset': '28' }, body: '[info] completed first load\n' })
		await expect(drawer.getByText('completed first load', { exact: true })).toBeVisible()
		await expect(drawer.getByRole('status', { name: 'Loading job logs' })).toHaveCount(0)
		await drawer.getByRole('switch', { name: 'Follow job logs' }).uncheck()
		await drawer.getByRole('textbox', { name: 'Search logs' }).fill('no-match')
		await expect(drawer.getByText('No matching log lines.', { exact: true })).toBeVisible()
		await drawer.screenshot({ path: testInfo.outputPath('job-logs-no-match.png'), animations: 'disabled' })
		await drawer.getByRole('textbox', { name: 'Search logs' }).fill('')
		await expect(drawer.getByText('completed first load', { exact: true })).toBeVisible()
	})

	test(`unavailable job details retain their target through retry at ${width}px`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installJobsMobileResponsiveFixtures(page)
		await seedJobsMobileResponsiveStorage(page)
		await seedLocalStorage(page, { apiRetryCount: 0 })
		const jobId = '3e4a886a-91fb-4a28-9ec5-479733ad5529'
		await page.addInitScript(({ jobId }) => {
			window.history.replaceState({ ...window.history.state, usr: { jobId, profileId: 'jobs-mobile-profile' } }, '')
		}, { jobId })
		let failing = true
		await page.route(`**/api/v1/jobs/${jobId}`, route => route.fulfill({
			status: failing ? 403 : 200,
			json: failing
				? { error: { code: 'forbidden', message: 'Synthetic job details denied.' } }
				: { id: jobId, type: 's3_zip_objects', status: 'succeeded', payload: { bucket: 'jobs-mobile-bucket', keys: ['annual.csv'] }, progress: null, error: null, createdAt: '2024-01-01T00:00:00Z', startedAt: null, finishedAt: '2024-01-01T00:00:10Z' },
		}))
		await gotoJobsPage(page)
		const drawer = page.getByRole('dialog', { name: 'Job Details', exact: true })
		await expect(drawer.getByText('Failed to load job', { exact: true })).toBeVisible({ timeout: 30_000 })
		await drawer.screenshot({ path: testInfo.outputPath('job-details-error.png'), animations: 'disabled' })
		await expect(drawer.getByText(jobId, { exact: true })).toBeVisible()
		failing = false
		await drawer.getByRole('button', { name: /Refresh/ }).click()
		await expect(drawer.getByText('succeeded', { exact: true })).toBeVisible()
		await expect(drawer.getByText(jobId, { exact: true })).toHaveCount(1)
		await expect(drawer.getByText('Failed to load job', { exact: true })).toHaveCount(0)
	})
}
