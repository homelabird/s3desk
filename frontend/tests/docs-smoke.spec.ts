import { expect, test } from '@playwright/test'

const isLive = process.env.E2E_LIVE === '1'

test.describe('Docs smoke', () => {
	test.skip(!isLive, 'E2E_LIVE=1 required')

	test('loads Swagger UI', async ({ page }) => {
		test.setTimeout(60_000)

		const docsBaseURL = process.env.DOCS_BASE_URL?.trim()
		const specURL = docsBaseURL ? new URL('/openapi.yml', docsBaseURL).toString() : '/openapi.yml'
		const docsURL = docsBaseURL ? new URL('/docs', docsBaseURL).toString() : '/docs'

		const specRes = await page.request.get(specURL)
		expect(specRes.ok()).toBeTruthy()

		const docsRes = await page.request.get(docsURL)
		expect(docsRes.ok()).toBeTruthy()
		const docsHtml = await docsRes.text()
		expect(docsHtml).toContain('<div id="swagger-ui"></div>')
		expect(docsHtml).toContain('SwaggerUIBundle')
		expect(docsHtml).toContain('/openapi.yml')

		await page.goto(docsURL)
		await expect(page.locator('#swagger-ui')).toBeVisible()
	})
})
