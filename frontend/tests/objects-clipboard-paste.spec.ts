import { expect, test, type Page } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	seedLocalStorage,
	textFixture,
} from './support/apiFixtures'
import { dialogByName } from './support/ui'

const profileA = 'clipboard-profile-a'
const profileB = 'clipboard-profile-b'
const bucket = 'clipboard-bucket'
const sourcePrefix = 'notes/'
const destinationPrefix = 'archive/'
const now = '2024-01-01T00:00:00Z'

type CreatedJobRequest = {
	type: string
	payload: {
		srcBucket: string
		dstBucket: string
		items: Array<{ srcKey: string; dstKey: string }>
		dryRun: boolean
	}
}

async function seedObjectsStorage(page: Page, overrides: Record<string, unknown> = {}) {
	const apiToken = 'clipboard-token'
	await seedLocalStorage(page, {
		apiToken,
		profileId: profileA,
		bucket,
		prefix: sourcePrefix,
		objectsUIMode: 'advanced',
		[`objects:${apiToken}:${profileB}:bucket`]: bucket,
		[`objects:${apiToken}:${profileB}:prefix`]: destinationPrefix,
		...overrides,
	})
}

async function installObjectsClipboardFixtures(page: Page, createdJobs: CreatedJobRequest[]) {
	const sourceItems = [
		{
			key: `${sourcePrefix}alpha.txt`,
			size: 128,
			lastModified: now,
			etag: '"alpha"',
		},
		{
			key: `${sourcePrefix}beta.txt`,
			size: 256,
			lastModified: now,
			etag: '"beta"',
		},
	]

	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: () => ({
				json: buildMetaFixture({
					allowedLocalDirs: [],
					uploadDirectStream: false,
				}),
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/profiles',
			handler: () => ({
				json: [
					buildProfileFixture({
						id: profileA,
						name: 'Clipboard A',
						createdAt: now,
						updatedAt: now,
					}),
					buildProfileFixture({
						id: profileB,
						name: 'Clipboard B',
						createdAt: now,
						updatedAt: now,
					}),
				],
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/buckets',
			handler: () => ({
				json: [buildBucketFixture(bucket, { createdAt: now })],
			}),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				const prefix = url.searchParams.get('prefix') ?? ''
				if (prefix === sourcePrefix) {
					return {
						json: buildObjectsListFixture({
							bucket,
							prefix,
							items: sourceItems,
						}),
					}
				}
				if (prefix === destinationPrefix) {
					return {
						json: buildObjectsListFixture({
							bucket,
							prefix,
							items: [],
						}),
					}
				}
				return {
					json: buildObjectsListFixture({
						bucket,
						prefix,
						commonPrefixes: [destinationPrefix, sourcePrefix],
						items: [],
					}),
				}
			},
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: ({ request }) => {
				const url = new URL(request.url())
				return {
					json: buildFavoritesFixture({
						bucket,
						prefix: url.searchParams.get('prefix') ?? '',
						items: [],
					}),
				}
			},
		},
		{
			method: 'POST',
			path: '/api/v1/jobs',
			handler: ({ request }) => {
				const payload = request.postDataJSON() as CreatedJobRequest
				createdJobs.push(payload)
				return {
					status: 201,
					json: {
						id: `job-${createdJobs.length}`,
						type: payload.type,
						status: 'queued',
						payload: payload.payload,
						createdAt: now,
						updatedAt: now,
					},
				}
			},
		},
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

async function selectSourceObjects(page: Page) {
	await expect(page.getByRole('checkbox', { name: 'Select alpha.txt' })).toBeVisible()
	await page.getByRole('checkbox', { name: 'Select alpha.txt' }).click()
	await page.getByRole('checkbox', { name: 'Select beta.txt' }).click()
	await expect(page.getByText('2 selected')).toBeVisible()
}

async function focusObjectsList(page: Page) {
	await page.getByRole('list', { name: 'Objects list' }).focus()
}

async function navigateToPath(page: Page, prefix: string) {
	await page.getByLabel('Go to path').click()
	const dialog = dialogByName(page, 'Go to path')
	await expect(dialog).toBeVisible()
	await dialog.getByLabel('Path').fill(prefix)
	await dialog.getByRole('button', { name: 'Go' }).click()
	await expect(dialog).toBeHidden()
	await expect(page.getByText(`s3://${bucket}/${prefix}`)).toBeVisible()
}

test.describe('Objects clipboard/paste', () => {
	test('copying selected keys then pasting into another prefix creates a copy job', async ({ page }) => {
		const createdJobs: CreatedJobRequest[] = []

		await installObjectsClipboardFixtures(page, createdJobs)
		await seedObjectsStorage(page)
		await page.goto('/objects')

		await selectSourceObjects(page)
		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+C')

		await navigateToPath(page, destinationPrefix)
		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+V')

		await expect.poll(() => createdJobs.length).toBe(1)
		expect(createdJobs[0]).toMatchObject({
			type: 'transfer_copy_batch',
			payload: {
				srcBucket: bucket,
				dstBucket: bucket,
				items: [
					{ srcKey: `${sourcePrefix}alpha.txt`, dstKey: `${destinationPrefix}alpha.txt` },
					{ srcKey: `${sourcePrefix}beta.txt`, dstKey: `${destinationPrefix}beta.txt` },
				],
				dryRun: false,
			},
		})
	})

	test('cutting selected keys then pasting requires MOVE confirmation and creates a move job', async ({ page }) => {
		const createdJobs: CreatedJobRequest[] = []

		await installObjectsClipboardFixtures(page, createdJobs)
		await seedObjectsStorage(page)
		await page.goto('/objects')

		await selectSourceObjects(page)
		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+X')

		await navigateToPath(page, destinationPrefix)
		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+V')

		const confirmDialog = dialogByName(page, /Move 2 object\(s\) here\?/)
		await expect(confirmDialog).toBeVisible()
		await confirmDialog.getByPlaceholder('MOVE').fill('MOVE')
		await confirmDialog.getByRole('button', { name: 'Move' }).click()

		await expect.poll(() => createdJobs.length).toBe(1)
		expect(createdJobs[0]).toMatchObject({
			type: 'transfer_move_batch',
			payload: {
				srcBucket: bucket,
				dstBucket: bucket,
				items: [
					{ srcKey: `${sourcePrefix}alpha.txt`, dstKey: `${destinationPrefix}alpha.txt` },
					{ srcKey: `${sourcePrefix}beta.txt`, dstKey: `${destinationPrefix}beta.txt` },
				],
				dryRun: false,
			},
		})
	})

	test('internal clipboard warns and skips paste after switching to a different profile', async ({ page }) => {
		const createdJobs: CreatedJobRequest[] = []
		const profileSelect = page.getByTestId('topbar-profile-select').getByLabel('Profile')
		const crossProfileWarning = 'Clipboard objects came from a different profile. Copy them again after switching profiles.'

		await installObjectsClipboardFixtures(page, createdJobs)
		await seedObjectsStorage(page)
		await page.goto('/objects')

		await selectSourceObjects(page)
		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+C')

		await profileSelect.selectOption(profileB)
		await expect(profileSelect).toHaveValue(profileB)
		await expect(page.getByText(`s3://${bucket}/${destinationPrefix}`)).toBeVisible()

		await focusObjectsList(page)
		await page.keyboard.press('ControlOrMeta+V')

		await expect(page.locator('span').filter({ hasText: crossProfileWarning }).first()).toBeVisible()
		await expect.poll(() => createdJobs.length).toBe(0)
	})
})
