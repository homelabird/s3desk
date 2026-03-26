import { expect, type Locator, type Page } from '@playwright/test'

type SearchScope = Page | Locator
const dialogOpenRetryCount = 3
const dialogOpenWaitMs = 1_500

async function waitForDialogVisible(dialog: Locator, timeout: number): Promise<boolean> {
	return dialog.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
}

export function dialogByName(scope: SearchScope, name: string | RegExp): Locator {
	return scope.getByRole('dialog', { name })
}

export async function ensureDialogOpen(scope: Page, name: string | RegExp, openDialog: () => Promise<void>): Promise<Locator> {
	const dialog = dialogByName(scope, name)
	const isVisible = await dialog.isVisible().catch(() => false)
	if (isVisible || (await waitForDialogVisible(dialog, 1_000))) {
		return dialog
	}

	let lastError: Error | null = null
	for (let attempt = 0; attempt < dialogOpenRetryCount; attempt += 1) {
		try {
			await openDialog()
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
		}

		if (await waitForDialogVisible(dialog, dialogOpenWaitMs)) {
			return dialog
		}

		await scope.waitForTimeout(250 * (attempt + 1))
	}

	if (lastError) {
		throw lastError
	}

	await expect(dialog).toBeVisible({ timeout: dialogOpenWaitMs })
	return dialog
}

export function transferUploadRow(scope: SearchScope, label: string | RegExp): Locator {
	return scope.getByTestId('transfer-upload-row').filter({ hasText: label }).first()
}

export function transferDownloadRow(scope: SearchScope, label: string | RegExp): Locator {
	return scope.getByTestId('transfer-download-row').filter({ hasText: label }).first()
}

export function objectsContextMenu(scope: SearchScope): Locator {
	return scope.getByTestId('objects-context-menu')
}
