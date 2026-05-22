import { expect, type ConsoleMessage, type FilePayload, type Locator, type Page, type Request } from '@playwright/test'

type SearchScope = Page | Locator
const dialogOpenRetryCount = 3
const dialogOpenWaitMs = 10_000
const pageReadyWaitMs = 30_000

export const OBJECTS_PAGE_HEADER_SELECTOR = '[data-testid="objects-page-header"]'
export const OBJECTS_LIST_CONTROLS_ROOT_SELECTOR = '[data-testid="objects-list-controls-root"]'
export const OBJECTS_TOOLBAR_MOBILE_TOP_ROW_SELECTOR = '[data-testid="objects-toolbar-mobile-top-row"]'
export const OBJECTS_TOOLBAR_MOBILE_ACTIONS_SELECTOR = '[data-testid="objects-toolbar-mobile-actions"]'
export const OBJECTS_LIST_ROW_SELECTOR = '[data-objects-row="true"]'
export const OBJECTS_SELECTION_BAR_SELECTOR = '[data-testid="objects-selection-bar"]'
export const OBJECTS_LIST_HEADER_ROW_SELECTOR = '[data-testid="objects-list-header-row"]'
export const OBJECTS_TREE_SHEET_SELECTOR = '[data-testid="objects-tree-sheet"]'
export const OBJECTS_TREE_CONTENT_SELECTOR = '[data-testid="objects-tree-content"]'
export const OBJECTS_TREE_STATUS_SELECTOR = '[data-testid="objects-tree-status"]'
export const OBJECTS_TREE_ROW_SELECTOR = '[data-testid="objects-tree-row"]'
export const OBJECTS_TREE_NEW_FOLDER_SELECTOR = '[data-testid="objects-tree-new-folder"]'
export const OBJECTS_FOLDERS_PANE_SELECTOR = '[data-testid="objects-folders-pane"]'
export const OBJECTS_FOLDERS_PANE_HEADER_SELECTOR = '[data-testid="objects-folders-pane-header"]'
export const OBJECTS_FOLDERS_PANE_BODY_SELECTOR = '[data-testid="objects-folders-pane-body"]'
export const OBJECTS_TOOLBAR_TABS_SELECTOR = '[data-testid="objects-toolbar-tabs"]'
export const OBJECTS_TOOLBAR_DESKTOP_NAV_SELECTOR = '[data-testid="objects-toolbar-desktop-nav"]'
export const OBJECTS_TOOLBAR_DESKTOP_ACTIONS_SELECTOR = '[data-testid="objects-toolbar-desktop-actions"]'
export const OBJECTS_BUCKET_PICKER_DESKTOP_SELECTOR = '[data-testid="objects-bucket-picker-desktop"]'
export const OBJECTS_BUCKET_PICKER_DESKTOP_VALUE_SELECTOR = '[data-testid="objects-bucket-picker-desktop-value"]'
export const OBJECTS_GLOBAL_SEARCH_SHEET_SELECTOR = '[data-testid="objects-global-search-sheet"]'
export const OBJECTS_GLOBAL_SEARCH_CONTENT_SELECTOR = '[data-testid="objects-global-search-content"]'
export const OBJECTS_GLOBAL_SEARCH_INDEX_TOGGLE_SELECTOR = '[data-testid="objects-global-search-index-toggle"]'
export const OBJECTS_GLOBAL_SEARCH_ACTIONS_SELECTOR = '[data-testid="objects-global-search-actions"]'
export const OBJECTS_GLOBAL_SEARCH_RESULT_CARD_SELECTOR = '[data-global-search-result-card="true"]'
export const OBJECTS_GLOBAL_SEARCH_TABLE_WRAP_SELECTOR = '[data-testid="objects-global-search-table-wrap"]'
export const OBJECTS_FILTERS_SHEET_SELECTOR = '[data-testid="objects-filters-sheet"]'
export const OBJECTS_FILTERS_CONTENT_SELECTOR = '[data-testid="objects-filters-content"]'
export const OBJECTS_FILTERS_ACTIONS_SELECTOR = '[data-testid="objects-filters-actions"]'
export const OBJECTS_DETAILS_ACTION_ROW_SELECTOR = '[data-testid="objects-details-action-row"]'
export const OBJECTS_DETAILS_PREVIEW_ACTIONS_SELECTOR = '[data-testid="objects-details-preview-actions"]'
export const OBJECTS_IMAGE_VIEWER_META_SELECTOR = '[data-testid="objects-image-viewer-meta"]'
export const OBJECTS_IMAGE_VIEWER_STAGE_SELECTOR = '[data-testid="objects-image-viewer-stage"]'
export const OBJECTS_IMAGE_VIEWER_FOOTER_SELECTOR = '[data-testid="objects-image-viewer-footer"]'
export const OBJECTS_LIST_CONTROLS_COMPACT_FOOTER_SELECTOR = '[data-testid="objects-list-controls-compact-footer"]'
export const OBJECTS_LIST_CONTROLS_COMPACT_META_SELECTOR = '[data-testid="objects-list-controls-compact-meta"]'
export const OBJECTS_LIST_CONTROLS_STATUS_COMPACT_SELECTOR = '[data-testid="objects-list-controls-status-compact"]'
export const OBJECTS_FAVORITES_CONTROLS_SELECTOR = '[data-testid="objects-favorites-controls"]'
export const OBJECTS_FAVORITES_PANE_SELECTOR = '[data-testid="objects-favorites-pane"]'
export const OBJECTS_FAVORITES_LIST_SELECTOR = '[data-testid="objects-favorites-pane"] [class*="favoritesList"]'
export const OBJECTS_FAVORITE_ITEM_SELECTOR = '[data-testid="objects-favorite-item"]'

async function waitForDialogVisible(dialog: Locator, timeout: number): Promise<boolean> {
	return dialog.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false)
}

async function findVisibleEnabledButton(
	page: Page,
	name: string | RegExp,
	timeout = pageReadyWaitMs,
	options: { stopWhen?: () => Promise<boolean> } = {},
): Promise<Locator> {
	const buttons = page.getByRole('button', { name })
	const deadline = Date.now() + timeout

	while (Date.now() < deadline) {
		if (options.stopWhen && (await options.stopWhen().catch(() => false))) {
			throw new Error('Button search stopped because the target state is already visible')
		}

		const count = await buttons.count().catch(() => 0)
		for (let index = 0; index < count; index += 1) {
			const button = buttons.nth(index)
			if ((await button.isVisible().catch(() => false)) && (await button.isEnabled().catch(() => false))) {
				return button
			}
		}
		await page.waitForTimeout(Math.min(200, Math.max(1, deadline - Date.now())))
	}

	const button = buttons.first()
	await expect(button).toBeVisible({ timeout: 1_000 })
	await expect(button).toBeEnabled({ timeout: 1_000 })
	return button
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
		if (await dialog.isVisible().catch(() => false)) {
			return dialog
		}

		try {
			await openDialog()
		} catch (error) {
			lastError = error instanceof Error ? error : new Error(String(error))
		}

		if (await waitForDialogVisible(dialog, dialogOpenWaitMs)) {
			return dialog
		}
	}

	if (lastError) {
		throw lastError
	}

	await expect(dialog).toBeVisible({ timeout: dialogOpenWaitMs })
	return dialog
}

const dynamicImportFailurePattern = /Failed to fetch dynamically imported module/i
const networkChangedPattern = /ERR_NETWORK_CHANGED/i

function isRecoverableChunkLoadFailure(message: string) {
	return dynamicImportFailurePattern.test(message) || networkChangedPattern.test(message)
}

function isRecoverableRequestFailure(request: Request) {
	const failureText = request.failure()?.errorText ?? ''
	return isRecoverableChunkLoadFailure(failureText)
}

export async function gotoWithDynamicImportRecovery(
	page: Page,
	url: string,
	ready: (page: Page) => Locator,
	options: { timeout?: number; maxAttempts?: number; retryOnTimeout?: boolean } = {},
): Promise<Locator> {
	const timeout = options.timeout ?? pageReadyWaitMs
	const maxAttempts = Math.max(1, options.maxAttempts ?? 2)
	let pageErrors: string[] = []
	let consoleErrors: string[] = []
	let requestFailures: string[] = []

	const onPageError = (error: Error) => {
		pageErrors.push(error.message)
	}
	const onConsole = (message: ConsoleMessage) => {
		if (message.type() !== 'error') return
		consoleErrors.push(message.text())
	}
	const onRequestFailed = (request: Request) => {
		if (!isRecoverableRequestFailure(request)) return
		requestFailures.push(`${request.url()} ${request.failure()?.errorText ?? ''}`.trim())
	}

	page.on('pageerror', onPageError)
	page.on('console', onConsole)
	page.on('requestfailed', onRequestFailed)

	try {
		let reloadBeforeAttempt = false
		for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
			pageErrors = []
			consoleErrors = []
			requestFailures = []

			if (attempt === 0) {
				await page.goto(url, { waitUntil: 'domcontentloaded' })
			} else if (reloadBeforeAttempt) {
				await page.reload({ waitUntil: 'domcontentloaded' })
			}
			reloadBeforeAttempt = false

			const locator = ready(page)
			const deadline = Date.now() + timeout

			while (Date.now() < deadline) {
				if (await locator.isVisible().catch(() => false)) {
					return locator
				}
				const recoverableFailure = [...pageErrors, ...consoleErrors].some(isRecoverableChunkLoadFailure) || requestFailures.length > 0
				if (recoverableFailure && attempt < maxAttempts - 1) {
					break
				}
				await locator.waitFor({ state: 'visible', timeout: Math.min(200, Math.max(1, deadline - Date.now())) }).catch(() => {})
			}

			const recoverableFailure = [...pageErrors, ...consoleErrors].some(isRecoverableChunkLoadFailure) || requestFailures.length > 0
			if (recoverableFailure && attempt < maxAttempts - 1) {
				reloadBeforeAttempt = true
				continue
			}
			if (options.retryOnTimeout && attempt < maxAttempts - 1) {
				continue
			}
			if (!recoverableFailure || attempt === maxAttempts - 1) {
				const finalWaitMs = recoverableFailure
					? pageReadyWaitMs
					: options.retryOnTimeout
						? Math.min(1_000, timeout)
						: Math.max(timeout, pageReadyWaitMs)
				await expect(locator).toBeVisible({ timeout: finalWaitMs })
				return locator
			}
		}
	} finally {
		page.off('pageerror', onPageError)
		page.off('console', onConsole)
		page.off('requestfailed', onRequestFailed)
	}

	return ready(page)
}

export async function openObjectsGlobalSearchDialog(
	page: Page,
	options: {
		triggerButtonName?: string | RegExp
	} = {},
): Promise<Locator> {
	const dialogName = 'Search bucket'
	const dialogLocator = dialogByName(page, dialogName)
	return ensureDialogOpen(page, dialogName, async () => {
		const button = await findVisibleEnabledButton(page, options.triggerButtonName ?? /Search bucket/, dialogOpenWaitMs, {
			stopWhen: () => dialogLocator.isVisible(),
		})
		if (await dialogLocator.isVisible().catch(() => false)) {
			return
		}
		await button.scrollIntoViewIfNeeded()
		await button.click()
	})
}

export async function gotoObjectsPage(
	page: Page,
	options: {
		timeout?: number
		maxAttempts?: number
		retryOnTimeout?: boolean
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	return gotoWithDynamicImportRecovery(
		page,
		'/objects',
		options.ready ?? ((scope) => scope.getByTestId('objects-list-controls-root')),
		{
			timeout: options.timeout,
			maxAttempts: options.maxAttempts,
			retryOnTimeout: options.retryOnTimeout,
		},
	)
}

export async function gotoJobsPage(
	page: Page,
	options: {
		timeout?: number
		maxAttempts?: number
		retryOnTimeout?: boolean
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	if (options.maxAttempts || options.retryOnTimeout) {
		return gotoWithDynamicImportRecovery(
			page,
			'/jobs',
			options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Activity' })),
			{
				timeout: options.timeout,
				maxAttempts: options.maxAttempts,
				retryOnTimeout: options.retryOnTimeout,
			},
		)
	}
	await page.goto('/jobs', { waitUntil: 'load' })
	const locator = (options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Activity' })))(page)
	await expect(locator).toBeVisible({ timeout: options.timeout ?? pageReadyWaitMs })
	return locator
}

export async function gotoJobsPageRaw(
	page: Page,
	options: {
		timeout?: number
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	await page.goto('/jobs')
	const locator = (options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Activity' })))(page)
	await expect(locator).toBeVisible({ timeout: options.timeout ?? pageReadyWaitMs })
	return locator
}

export async function gotoProfilesPage(
	page: Page,
	options: {
		timeout?: number
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	await page.goto('/profiles', { waitUntil: 'load' })
	const locator = (options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Profiles' })))(page)
	await expect(locator).toBeVisible({ timeout: options.timeout ?? pageReadyWaitMs })
	return locator
}

export async function gotoBucketsPage(
	page: Page,
	options: {
		timeout?: number
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	await page.goto('/buckets', { waitUntil: 'load' })
	const locator = (options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Buckets' })))(page)
	await expect(locator).toBeVisible({ timeout: options.timeout ?? pageReadyWaitMs })
	return locator
}

export async function gotoUploadsPage(
	page: Page,
	options: {
		timeout?: number
		ready?: (page: Page) => Locator
	} = {},
): Promise<Locator> {
	await page.goto('/uploads', { waitUntil: 'load' })
	const locator = (options.ready ?? ((scope) => scope.getByRole('heading', { name: 'Uploads' })))(page)
	await expect(locator).toBeVisible({ timeout: options.timeout ?? pageReadyWaitMs })
	return locator
}

export async function gotoObjectsUploadPage(
	page: Page,
	options: {
		timeout?: number
		maxAttempts?: number
		retryOnTimeout?: boolean
	} = {},
): Promise<Locator> {
	return gotoObjectsPage(page, {
		...options,
		ready: objectsBucketPickerTrigger,
	})
}

export async function selectObjectsBucket(page: Page, name: string): Promise<void> {
	let picker = page.getByTestId('objects-bucket-picker-desktop')
	if (!(await picker.isVisible({ timeout: 1_000 }).catch(() => false))) {
		picker = objectsBucketPickerTrigger(page)
	}
	await expect(picker).toBeVisible()
	await picker.click()

	const option = page.getByTestId(`objects-bucket-picker-option-${name}`)
	await expect(option).toBeVisible()
	await option.click()
}

export async function gotoObjectsBucketPage(
	page: Page,
	name: string,
	options: {
		timeout?: number
		maxAttempts?: number
		retryOnTimeout?: boolean
		ready?: (page: Page) => Locator
	} = {},
): Promise<void> {
	await gotoObjectsPage(page, {
		timeout: options.timeout,
		maxAttempts: options.maxAttempts,
		retryOnTimeout: options.retryOnTimeout,
		ready: options.ready ?? objectsBucketPickerTrigger,
	})
	await selectObjectsBucket(page, name)
}

export async function gotoObjectsUploadBucketPage(
	page: Page,
	name: string,
	options: {
		timeout?: number
		maxAttempts?: number
		retryOnTimeout?: boolean
	} = {},
): Promise<void> {
	await gotoObjectsUploadPage(page, options)
	await selectObjectsBucket(page, name)
}

export async function dropFileIntoObjectsUploadZone(
	page: Page,
	args: {
		name: string
		contents: string
		type: string
		fullPath?: string
		assertEntryBinding?: boolean
		dropEffect?: DataTransfer['dropEffect']
	},
): Promise<void> {
	const dataTransfer = await page.evaluateHandle(
		({ name, contents, type, fullPath, assertEntryBinding, dropEffect }) => {
			const dt = new DataTransfer()
			const entry: {
				isFile: boolean
				isDirectory: boolean
				fullPath: string
				name: string
				file: (success: (file: File) => void, error?: (err: unknown) => void) => void
			} = {
				isFile: true,
				isDirectory: false,
				fullPath: fullPath || `/${name}`,
				name,
				file(success) {
					if (assertEntryBinding && this !== entry) {
						throw new Error('Illegal invocation')
					}
					success(new File([contents], name, { type }))
				},
			}
			const item = { webkitGetAsEntry: () => entry }
			Object.defineProperty(dt, 'items', { value: [item] })
			Object.defineProperty(dt, 'files', { value: [] })
			Object.defineProperty(dt, 'types', { value: ['Files'] })
			if (dropEffect) {
				dt.dropEffect = dropEffect
			}
			return dt
		},
		args,
	)

	const dropZone = page.getByTestId('objects-upload-dropzone')
	await expect(dropZone).toBeVisible()
	await dropZone.dispatchEvent('dragenter', { dataTransfer })
	await dropZone.dispatchEvent('dragover', { dataTransfer })
	await dropZone.dispatchEvent('drop', { dataTransfer })
}

type UploadSourceSelection = string | FilePayload | Array<string | FilePayload>

export async function setFilesFromNextChooser(
	page: Page,
	files: UploadSourceSelection,
	trigger: () => Promise<void>,
): Promise<void> {
	const chooserPromise = page.waitForEvent('filechooser')
	await trigger()
	const chooser = await chooserPromise
	await chooser.setFiles(files)
}

export async function addUploadSourceFromDevice(
	page: Page,
	files: UploadSourceSelection,
	options: {
		openButtonName?: string | RegExp
		dialogName?: string | RegExp
		chooseButtonName?: string | RegExp
	} = {},
): Promise<Locator> {
	const dialog = await ensureDialogOpen(page, options.dialogName ?? 'Add upload source', async () => {
		await page.getByRole('button', { name: options.openButtonName ?? /Add from device/i }).click()
	})
	await setFilesFromNextChooser(page, files, async () => {
		await dialog.getByRole('button', { name: options.chooseButtonName ?? 'Choose files' }).click()
	})
	await expect(dialog).toHaveCount(0, { timeout: 3_000 })
	return dialog
}

export async function openCreateDeleteJobDrawer(
	page: Page,
	options: {
		moreButtonName?: string | RegExp
		timeout?: number
	} = {},
): Promise<Locator> {
	const drawer = await ensureDialogOpen(page, 'Create delete job (S3)', async () => {
		await page.getByRole('button', { name: options.moreButtonName ?? 'More job actions' }).click()
		await page.getByRole('menuitem', { name: 'Delete bucket or prefix...' }).click()
	})
	await expect(drawer).toBeVisible({ timeout: options.timeout })
	return drawer
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export async function clickBucketCardManageAction(
	page: Page,
	bucketCard: Locator,
	bucketName: string,
	actionName: string | RegExp,
): Promise<void> {
	await bucketCard.getByRole('button', { name: `Manage bucket ${bucketName}` }).click()
	await page.getByRole('menu').last().getByRole('menuitem', { name: actionName }).click()
}

function contextualJobActionName(actionName: string | RegExp): string | RegExp {
	if (actionName instanceof RegExp) return actionName
	return new RegExp(`^${escapeRegExp(actionName)}(?: (?:for )?job .+)?$`)
}

export async function openJobDetailsDrawer(
	page: Page,
	row: Locator,
	options: { timeout?: number } = {},
): Promise<Locator> {
	await row.getByRole('button', { name: /^Details(?: for job .+)?$/ }).click()
	const drawer = page.getByRole('dialog', { name: 'Job Details' })
	await expect(drawer).toBeVisible({ timeout: options.timeout })
	return drawer
}

export async function openJobLogsDrawer(
	page: Page,
	row: Locator,
	options: { timeout?: number } = {},
): Promise<Locator> {
	await row.getByRole('button', { name: /^Logs(?: for job .+)?$/ }).click()
	const drawer = page.getByRole('dialog', { name: 'Job Logs' })
	await expect(drawer).toBeVisible({ timeout: options.timeout })
	return drawer
}

export async function chooseRowAction(
	page: Page,
	row: Locator,
	actionName: string | RegExp,
	options: { timeout?: number } = {},
): Promise<void> {
	const trigger = row.getByRole('button', { name: /^(?:Open actions menu|Actions(?: for job .+)?)$/ })
	await trigger.scrollIntoViewIfNeeded()
	await trigger.click()
	const action = page.getByRole('menuitem', { name: contextualJobActionName(actionName) })
	await expect(action).toBeVisible({ timeout: options.timeout })
	await action.click()
}

export async function openJobsDownloadDrawer(
	page: Page,
	options: {
		triggerButtonName?: string | RegExp
		timeout?: number
	} = {},
): Promise<Locator> {
	const trigger = page.getByRole('button', { name: options.triggerButtonName ?? /^Download/ }).first()
	await trigger.scrollIntoViewIfNeeded()
	await trigger.click()
	const drawer = page.getByRole('dialog', { name: 'Download folder (S3 → device)' })
	await expect(drawer).toBeVisible({ timeout: options.timeout })
	return drawer
}

export async function openJobsMobileFilters(
	page: Page,
	options: { timeout?: number } = {},
): Promise<Locator> {
	const trigger = page.getByTestId('jobs-mobile-filters-trigger')
	await expect(trigger).toBeVisible({ timeout: options.timeout })
	await trigger.click()
	const sheet = page.getByTestId('jobs-mobile-filters-sheet')
	await expect(sheet).toBeVisible({ timeout: options.timeout })
	return sheet
}

export async function closeJobsMobileFilters(
	sheet: Locator,
	options: {
		buttonName?: string | RegExp
		timeout?: number
	} = {},
): Promise<void> {
	await sheet.getByRole('button', { name: options.buttonName ?? 'Done' }).click()
	await expect(sheet).toHaveCount(0, { timeout: options.timeout })
}

export async function openTransfersDialog(
	page: Page,
	options: {
		triggerButtonName?: string | RegExp
		tabName?: string | RegExp
	} = {},
): Promise<Locator> {
	const dialogName = /Transfers/i
	const dialogLocator = dialogByName(page, dialogName)
	const dialog = await ensureDialogOpen(page, dialogName, async () => {
		const button = await findVisibleEnabledButton(page, options.triggerButtonName ?? /Open Transfers|Transfers/i, dialogOpenWaitMs, {
			stopWhen: () => dialogLocator.isVisible(),
		})
		if (await dialogLocator.isVisible().catch(() => false)) {
			return
		}
		await button.click({ timeout: 2_000 }).catch(async (error) => {
			if (await dialogLocator.isVisible().catch(() => false)) {
				return
			}
			throw error
		})
	})

	if (options.tabName) {
		const tab = dialog.getByRole('tab', { name: options.tabName })
		await expect(tab).toBeVisible()
		if ((await tab.getAttribute('aria-selected')) !== 'true') {
			await tab.click()
		}
	}

	return dialog
}

export async function queueSelectedUpload(
	page: Page,
	options: {
		count?: number
		timeout?: number
	} = {},
): Promise<void> {
	const buttonName = typeof options.count === 'number' ? new RegExp(`Queue upload \\(${options.count}\\)`, 'i') : /Queue upload/i
	const button = page.getByRole('button', { name: buttonName })
	await expect(button).toBeEnabled({ timeout: options.timeout })
	await button.click()
}

export async function openTransfersUploadRow(
	page: Page,
	label: string | RegExp,
	options: {
		triggerButtonName?: string | RegExp
		timeout?: number
	} = {},
): Promise<{ dialog: Locator; row: Locator }> {
	const dialog = await openTransfersDialog(page, {
		triggerButtonName: options.triggerButtonName,
		tabName: /Uploads/i,
	})
	const row = transferUploadRow(dialog, label)
	await expect(row).toBeVisible({ timeout: options.timeout })
	return { dialog, row }
}

export async function openTransfersDownloadRow(
	page: Page,
	label: string | RegExp,
	options: {
		triggerButtonName?: string | RegExp
		timeout?: number
	} = {},
): Promise<{ dialog: Locator; row: Locator }> {
	const dialog = await openTransfersDialog(page, {
		triggerButtonName: options.triggerButtonName,
		tabName: /Downloads/i,
	})
	const row = transferDownloadRow(dialog, label)
	await expect(row).toBeVisible({ timeout: options.timeout })
	return { dialog, row }
}

export async function expectTransferRowState(
	row: Locator,
	state: string | RegExp,
	options: { timeout?: number } = {},
): Promise<Locator> {
	const stateLocator = typeof state === 'string' ? row.getByText(state, { exact: true }) : row.getByText(state)
	await expect(stateLocator).toBeVisible({ timeout: options.timeout })
	return stateLocator
}

export async function clickTransferRowButton(
	row: Locator,
	buttonName: string | RegExp,
	options: { timeout?: number } = {},
): Promise<Locator> {
	const button = row.getByRole('button', { name: buttonName })
	await expect(button).toBeVisible({ timeout: options.timeout })
	await button.click()
	return button
}

export async function expectTransferRowButton(
	row: Locator,
	buttonName: string | RegExp,
	options: { timeout?: number } = {},
): Promise<Locator> {
	const button = row.getByRole('button', { name: buttonName })
	await expect(button).toBeVisible({ timeout: options.timeout })
	return button
}

export async function commitComboboxValue(
	page: Page,
	scope: SearchScope,
	name: string | RegExp,
	value: string,
): Promise<Locator> {
	const combobox = scope.getByRole('combobox', { name })
	await expect(combobox).toBeVisible()
	await combobox.click()
	await combobox.fill(value)
	await page.keyboard.press('Enter')
	return combobox
}

export function transferUploadRow(scope: SearchScope, label: string | RegExp): Locator {
	return scope.getByTestId('transfer-upload-row').filter({ hasText: label }).first()
}

export function transferDownloadRow(scope: SearchScope, label: string | RegExp): Locator {
	return scope.getByTestId('transfer-download-row').filter({ hasText: label }).first()
}

export function objectsListRow(scope: SearchScope, label: string | RegExp): Locator {
	return scope.locator(OBJECTS_LIST_ROW_SELECTOR).filter({ hasText: label }).first()
}

export function objectsListRows(scope: SearchScope): Locator {
	return scope.locator(OBJECTS_LIST_ROW_SELECTOR)
}

export function objectsSelectionCheckbox(scope: SearchScope, label: string): Locator {
	return scope.getByRole('checkbox', { name: new RegExp(`^Select ${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}$`) })
}

export function objectsTreeRow(scope: SearchScope, depth?: number): Locator {
	return scope.locator(depth == null ? OBJECTS_TREE_ROW_SELECTOR : `${OBJECTS_TREE_ROW_SELECTOR}[data-tree-depth="${depth}"]`)
}

export function objectsTreeStatus(scope: SearchScope): Locator {
	return scope.locator(OBJECTS_TREE_STATUS_SELECTOR)
}

export function objectsFavoritesControls(scope: SearchScope): Locator {
	return scope.locator(OBJECTS_FAVORITES_CONTROLS_SELECTOR)
}

export function objectsFavoriteItem(scope: SearchScope, label?: string | RegExp): Locator {
	const locator = scope.locator(OBJECTS_FAVORITE_ITEM_SELECTOR)
	return label == null ? locator : locator.filter({ hasText: label }).first()
}

export function objectsBucketPickerDesktop(scope: SearchScope): Locator {
	return scope.locator(OBJECTS_BUCKET_PICKER_DESKTOP_SELECTOR)
}

export function objectsBucketPickerTrigger(scope: SearchScope): Locator {
	return scope.getByRole('button', { name: /^Bucket:/ })
}

export function objectsGlobalSearchTableWrap(scope: SearchScope): Locator {
	return scope.locator(OBJECTS_GLOBAL_SEARCH_TABLE_WRAP_SELECTOR)
}

export function namedTableRow(scope: SearchScope, label: string | RegExp): Locator {
	const name = typeof label === 'string' ? new RegExp(label, 'i') : label
	return scope.getByRole('row', { name }).first()
}

export function jobsTableRow(scope: SearchScope, label: string | RegExp): Locator {
	return namedTableRow(scope, label)
}

export function objectsContextMenu(scope: SearchScope): Locator {
	return scope.getByTestId('objects-context-menu')
}
