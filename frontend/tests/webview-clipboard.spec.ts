import { expect, test, type Page } from '@playwright/test'

import { defaultWebviewStorage, seedWebviewStorage, stubWebviewApi } from './support/webviewFixtures'

const clipboardWritesKey = '__s3deskWebviewClipboardWrites'
const copyFailureHint = 'Copy failed. Clipboard access is restricted on insecure origins (try HTTPS or localhost).'
const now = '2024-01-01T00:00:00Z'

async function emulateSecureClipboard(page: Page) {
	await page.addInitScript((writesKey) => {
		const writes: string[] = []
		Object.defineProperty(window, writesKey, {
			value: writes,
			configurable: true,
		})

		Object.defineProperty(window, 'isSecureContext', {
			value: true,
			configurable: true,
		})

		Object.defineProperty(navigator, 'clipboard', {
			value: {
				writeText: async (text: string) => {
					writes.push(text)
				},
			},
			configurable: true,
		})
	}, clipboardWritesKey)
}

async function readClipboardWrites(page: Page) {
	return page.evaluate((writesKey) => {
		const windowWithWrites = window as Window & Record<string, string[] | undefined>
		return windowWithWrites[writesKey] ?? []
	}, clipboardWritesKey)
}

test.describe('webview clipboard', () => {
	test('WV-008 shows secure-context copy-location success feedback on Objects', async ({ page }) => {
		const location = `s3://${defaultWebviewStorage.bucket}/${defaultWebviewStorage.prefix}`

		await emulateSecureClipboard(page)
		await stubWebviewApi(page, {
			objectListings: {
				[defaultWebviewStorage.prefix]: {
					items: [
						{
							key: `${defaultWebviewStorage.prefix}summary.csv`,
							size: 512,
							lastModified: now,
							etag: '"summary"',
						},
					],
				},
			},
		})
		await seedWebviewStorage(page)

		await page.goto('/objects')

		await expect(page.getByText('summary.csv')).toBeVisible()
		await expect(page.getByText(location, { exact: true })).toBeVisible()

		await page.getByRole('button', { name: 'Copy location' }).click()

		await expect(page.getByText('Copied')).toBeVisible()
		await expect(page.getByText(copyFailureHint)).toHaveCount(0)
		await expect.poll(async () => (await readClipboardWrites(page)).at(-1)).toBe(location)
	})
})
