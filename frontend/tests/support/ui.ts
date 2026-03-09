import { expect, type Locator, type Page } from '@playwright/test'

type SearchScope = Page | Locator

export function dialogByName(scope: SearchScope, name: string | RegExp): Locator {
	return scope.getByRole('dialog', { name })
}

export async function ensureDialogOpen(scope: Page, name: string | RegExp, openDialog: () => Promise<void>): Promise<Locator> {
	const dialog = dialogByName(scope, name)
	const isVisible = await dialog.isVisible().catch(() => false)
	const becameVisible = isVisible
		? true
		: await dialog.waitFor({ state: 'visible', timeout: 1000 }).then(() => true).catch(() => false)
	if (!becameVisible) {
		await openDialog()
	}
	await expect(dialog).toBeVisible()
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
