import { expect, test } from '@playwright/test'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	seedLocalStorage,
} from './support/apiFixtures'

const profileId = 'playwright-move-profile'
const bucket = 'move-bucket'
const now = '2024-01-01T00:00:00Z'

test('mobile selection bar opens move sheet and submits a move job', async ({ page }) => {
	let createdJobPayload: unknown = null

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
						id: profileId,
						name: 'Move Profile',
						createdAt: now,
						updatedAt: now,
					}),
				],
			}),
		},
		{
			method: 'GET',
			path: '/api/v1/buckets',
			handler: () => ({ json: [buildBucketFixture(bucket, { createdAt: now })] }),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects`,
			handler: () => ({
				json: buildObjectsListFixture({
					bucket,
					items: [
						{
							key: 'notes/todo.txt',
							size: 128,
							lastModified: now,
							etag: '"todo"',
						},
					],
				}),
			}),
		},
		{
			method: 'GET',
			path: `/api/v1/buckets/${bucket}/objects/favorites`,
			handler: () => ({ json: buildFavoritesFixture({ bucket }) }),
		},
		{
			method: 'POST',
			path: '/api/v1/jobs',
			handler: ({ request }) => {
				createdJobPayload = request.postDataJSON()
				return {
					status: 201,
					json: {
						id: 'job-move-1',
						type: 'transfer_move_batch',
						status: 'queued',
						payload: (createdJobPayload as { payload?: unknown })?.payload ?? {},
						createdAt: now,
						updatedAt: now,
					},
				}
			},
		},
	])

	await seedLocalStorage(page, {
		apiToken: 'change-me',
		profileId,
		bucket,
		objectsUIMode: 'simple',
		prefix: '',
	})

	await page.setViewportSize({ width: 390, height: 844 })
	await page.goto('/objects')

	await page.getByRole('checkbox', { name: 'Select notes/todo.txt' }).click()
	await expect(page.getByRole('button', { name: 'Move to…' })).toBeVisible()

	await page.getByRole('button', { name: 'Move to…' }).click()
	await expect(page.getByTestId('objects-move-selection-sheet')).toBeVisible()

	await page.getByLabel('Destination folder').fill('archive/mobile/')
	await page.getByLabel('Type "MOVE" to confirm').fill('MOVE')
	await page.getByRole('button', { name: 'Start move' }).click()

	await expect.poll(() => createdJobPayload).not.toBeNull()
	expect(createdJobPayload).toMatchObject({
		type: 'transfer_move_batch',
		payload: {
			srcBucket: bucket,
			dstBucket: bucket,
			items: [{ srcKey: 'notes/todo.txt', dstKey: 'archive/mobile/notes/todo.txt' }],
			dryRun: false,
		},
	})
})
