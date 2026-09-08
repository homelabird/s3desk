import { expect, test } from '@playwright/test'

import { profileScopedStorageKeyForOrigin } from '../src/lib/profileScopedStorage'

import {
	buildBucketFixture,
	buildFavoritesFixture,
	buildMetaFixture,
	buildObjectsListFixture,
	buildProfileFixture,
	installApiFixtures,
	jsonFixture,
	textFixture,
	seedLocalStorage,
} from './support/apiFixtures'
import { closeJobsMobileFilters, dialogByName, gotoObjectsPage, objectsSelectionCheckbox, openJobsMobileFilters } from './support/ui'

const profileId = 'playwright-move-profile'
const bucket = 'move-bucket'
const now = '2024-01-01T00:00:00Z'

test('mobile selection bar opens move sheet and submits a move job', async ({ page, baseURL }, testInfo) => {
	let createdJobPayload: unknown = null
	let detailsProfile: string | undefined
	let jobStatus = 'queued'

	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
		{ method: 'GET', path: '/api/v1/jobs/job-move-1', handler: ({ request }) => {
			detailsProfile = request.headers()['x-profile-id']
			return { json: {
				id: 'job-move-1', type: 'transfer_move_batch', status: jobStatus,
				payload: { srcBucket: bucket, dstBucket: bucket }, createdAt: now,
			} }
		} },
		textFixture('GET', '/api/v1/jobs/job-move-1/logs', ''),
		textFixture('GET', '/api/v1/events', '', { contentType: 'text/event-stream' }),
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
					buildProfileFixture({ id: 'another-profile', name: 'Another profile', createdAt: now, updatedAt: now }),
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
		[profileScopedStorageKeyForOrigin('jobs', baseURL, 'change-me', profileId, 'statusFilter')]: 'failed',
		prefix: '',
	})

	await page.setViewportSize({ width: 390, height: 844 })
	await gotoObjectsPage(page)

	await objectsSelectionCheckbox(page, 'notes/todo.txt').click()
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
	await expect(page.getByRole('button', { name: 'Open Jobs', exact: true })).toBeVisible()
	await page.getByTestId('topbar-profile-select').getByLabel('Profile').selectOption('another-profile')
	await page.getByRole('button', { name: 'Open Jobs', exact: true }).click()
	const details = dialogByName(page, 'Job Details')
	await expect(details.getByText('job-move-1', { exact: true })).toBeVisible()
	await expect(details.getByText('queued', { exact: true })).toBeVisible()
	jobStatus = 'succeeded'
	await details.getByRole('button', { name: /Refresh/ }).click()
	await expect(details.getByText('succeeded', { exact: true })).toBeVisible()
	await page.screenshot({ path: testInfo.outputPath('created-job-details.png') })
	expect(detailsProfile).toBe(profileId)
	await expect(page.getByTestId('topbar-profile-select').getByLabel('Profile')).toHaveValue(profileId)
	await details.getByRole('button', { name: 'Close', exact: true }).click()
	const filters = await openJobsMobileFilters(page)
	await expect(filters.getByRole('combobox', { name: 'Job status filter' })).toHaveValue('failed')
	await closeJobsMobileFilters(page.getByTestId('jobs-mobile-filters-sheet'))
})
