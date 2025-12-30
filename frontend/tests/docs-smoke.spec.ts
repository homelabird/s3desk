import { expect, test } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'

test.describe('Docs smoke', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('loads Swagger UI', async ({ page }) => {
		test.setTimeout(60_000)

		const specRes = await page.request.get('/openapi.yml')
		expect(specRes.ok()).toBeTruthy()

		await page.goto('/docs')
		await expect(page.locator('#swagger-ui .swagger-ui').first()).toBeVisible({ timeout: 30_000 })
		await expect(page.getByText('S3Desk API')).toBeVisible()
	})
})
