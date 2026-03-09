import type { Page } from '@playwright/test'

export async function seedLocalStorage(page: Page, values: Record<string, unknown>) {
	await page.addInitScript((entries) => {
		for (const [key, value] of Object.entries(entries)) {
			window.localStorage.setItem(key, JSON.stringify(value))
		}
	}, values)
}
