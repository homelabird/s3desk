import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, metaJson, seedLocalStorage } from './support/apiFixtures'
import { clickBucketCardManageAction, gotoBucketsPage } from './support/ui'

const now = '2026-03-10T00:00:00Z'
const profileId = 'governance-profile'
const bucket = 'governance-bucket'

async function seedBucketsPage(args: {
	page: Page
	profile: Record<string, unknown>
	governance: Record<string, unknown>
	onPutAccess?: (body: unknown) => void
	onPutPolicy?: (body: unknown) => void
	onPutSharing?: (body: unknown) => Record<string, unknown>
	onValidatePolicy?: (body: unknown) => Promise<Record<string, unknown>>
	settingsUnavailable?: () => boolean
}) {
	let currentGovernance = structuredClone(args.governance)
	let currentPolicy: unknown = {}
	await installApiFixtures(args.page, [
		{
			method: 'GET',
			path: '/events',
			handler: () => ({ status: 200, body: '', contentType: 'text/event-stream' }),
		},
		{
			method: 'GET',
			path: '/meta',
			handler: () => ({
				json: metaJson({
					capabilities: {
						profileTls: { enabled: false, reason: 'test' },
						providers: {},
					},
				}),
			}),
		},
		{
			method: 'GET',
			path: '/profiles',
			handler: () => ({
				json: [args.profile],
			}),
		},
		{
			method: 'GET',
			path: '/buckets',
			handler: () => ({
				json: [{ name: bucket, createdAt: now }],
			}),
		},
		{
			method: 'GET', path: `/buckets/${bucket}/policy`,
			handler: () => args.settingsUnavailable?.()
				? { status: 503, json: { error: { code: 'upstream_unavailable', message: 'Settings temporarily unavailable' } } }
				: { json: { bucket, exists: true, policy: currentPolicy } },
		},
		{
			method: 'PUT', path: `/buckets/${bucket}/policy`,
			handler: (ctx) => {
				const body = ctx.request.postDataJSON()
				args.onPutPolicy?.(body)
				currentPolicy = body.policy
				return { status: 204 }
			},
		},
		{
			method: 'POST', path: `/buckets/${bucket}/policy/validate`,
			handler: async (ctx) => ({ json: await args.onValidatePolicy?.(ctx.request.postDataJSON()) }),
		},
		{
			method: 'GET',
			path: `/buckets/${bucket}/governance`,
			handler: () => args.settingsUnavailable?.()
				? { status: 503, json: { error: { code: 'upstream_unavailable', message: 'Settings temporarily unavailable' } } }
				: { json: currentGovernance },
		},
		{
			method: 'PUT',
			path: `/buckets/${bucket}/governance/sharing`,
			handler: (ctx) => {
				const sharing = args.onPutSharing?.(ctx.request.postDataJSON())
				const requests = (sharing?.preauthenticatedRequests ?? []) as Record<string, unknown>[]
				currentGovernance = {
					...currentGovernance,
					sharing: { ...sharing, preauthenticatedRequests: requests.map((item) => ({ ...item, accessUri: undefined })) },
				}
				return { json: sharing }
			},
		},
		{
			method: 'PUT',
			path: `/buckets/${bucket}/governance/access`,
			handler: (ctx) => {
				const body = ctx.request.postDataJSON()
				args.onPutAccess?.(body)
				currentGovernance = {
					...currentGovernance,
					access: {
						provider: args.profile.provider,
						bucket,
						...(body as Record<string, unknown>),
					},
				}
				return {
					json: currentGovernance.access,
				}
			},
		},
	])

	await seedLocalStorage(args.page, {
		apiToken: 'playwright-token',
		apiRetryCount: 0,
		profileId,
		bucket,
	})
}

async function openControls(page: Page) {
	await gotoBucketsPage(page, {
		ready: (scope) => scope.getByText(bucket),
	})
	await clickBucketCardManageAction(page, page.locator('body'), bucket, /Controls/)
}

test('GCS governance access uses the structured IAM bindings editor', async ({ page }) => {
	const accessBodies: unknown[] = []
	await seedBucketsPage({
		page,
		profile: {
			id: profileId,
			provider: 'gcp_gcs',
			name: 'Playwright GCS',
			projectNumber: '1234567890',
			createdAt: now,
			updatedAt: now,
		},
		governance: {
			provider: 'gcp_gcs',
			bucket,
			capabilities: {
				bucket_access_bindings: { enabled: true },
				bucket_access_public_toggle: { enabled: true },
				bucket_public_access_prevention: { enabled: true },
				bucket_uniform_access: { enabled: true },
				bucket_versioning: { enabled: true },
				bucket_retention: { enabled: true },
			},
			publicExposure: {
				provider: 'gcp_gcs',
				bucket,
				mode: 'private',
				publicAccessPrevention: false,
			},
			access: {
				provider: 'gcp_gcs',
				bucket,
				etag: 'etag-before',
				bindings: [
					{
						role: 'roles/storage.objectViewer',
						members: ['user:dev@example.com'],
					},
				],
			},
			protection: {
				provider: 'gcp_gcs',
				bucket,
				uniformAccess: true,
				retention: { enabled: true, days: 30 },
			},
			versioning: {
				provider: 'gcp_gcs',
				bucket,
				status: 'enabled',
			},
		},
		onPutAccess: (body) => accessBodies.push(body),
	})

	await openControls(page)
	await expect(page.getByText('GCS Controls', { exact: true })).toBeVisible()

	const accessSection = page.getByTestId('bucket-governance-access')
	await accessSection.getByRole('textbox', { name: 'Policy ETag' }).fill('etag-after')
	const bindingCard = accessSection.getByTestId('bucket-governance-gcs-binding-card').first()
	await bindingCard.getByRole('textbox', { name: 'Role' }).fill('roles/storage.objectAdmin')
	await bindingCard.getByRole('textbox', { name: 'Members' }).fill('user:alice@example.com\nallAuthenticatedUsers')
	await bindingCard.getByRole('switch', { name: 'GCS binding condition 1' }).click()
	await bindingCard.getByRole('textbox', { name: 'Condition title' }).fill('Temp access')
	await bindingCard
		.getByRole('textbox', { name: 'Condition expression' })
		.fill('request.time < timestamp("2026-12-31T00:00:00Z")')
	await accessSection.getByRole('button', { name: 'Save' }).click()

	await expect.poll(() => accessBodies.length).toBe(1)
	expect(accessBodies[0]).toEqual({
		bindings: [
			{
				role: 'roles/storage.objectAdmin',
				members: ['user:alice@example.com', 'allAuthenticatedUsers'],
				condition: {
					title: 'Temp access',
					expression: 'request.time < timestamp("2026-12-31T00:00:00Z")',
				},
			},
		],
		etag: 'etag-after',
	})
	await expect(page.locator('#a11y-status')).toHaveText('IAM bindings updated')
	await expect(page.getByText('Refreshing', { exact: true })).toHaveCount(0)
})

test('Azure governance access uses the structured stored access policy editor', async ({ page }) => {
	const accessBodies: unknown[] = []
	await seedBucketsPage({
		page,
		profile: {
			id: profileId,
			provider: 'azure_blob',
			name: 'Playwright Azure',
			accountName: 'playwright',
			accountKey: 'secret',
			createdAt: now,
			updatedAt: now,
		},
		governance: {
			provider: 'azure_blob',
			bucket,
			capabilities: {
				bucket_access_public_toggle: { enabled: true },
				bucket_stored_access_policy: { enabled: true },
				bucket_versioning: { enabled: true },
				bucket_soft_delete: { enabled: true },
				bucket_immutability: { enabled: true },
			},
			publicExposure: {
				provider: 'azure_blob',
				bucket,
				mode: 'private',
				visibility: 'private',
			},
			access: {
				provider: 'azure_blob',
				bucket,
				storedAccessPolicies: [],
			},
			protection: {
				provider: 'azure_blob',
				bucket,
				softDelete: { enabled: true, days: 7 },
				immutability: { enabled: false, editable: true },
			},
			versioning: {
				provider: 'azure_blob',
				bucket,
				status: 'disabled',
			},
		},
		onPutAccess: (body) => accessBodies.push(body),
	})

	await openControls(page)
	await expect(page.getByText('Azure Controls', { exact: true })).toBeVisible()

	const accessSection = page.getByTestId('bucket-governance-access')
	await accessSection.getByRole('button', { name: 'Add policy' }).click()
	await expect(
		accessSection.getByTestId('bucket-governance-azure-stored-access-policy-card'),
	).toHaveCount(1)
	const policyCard = accessSection
		.getByTestId('bucket-governance-azure-stored-access-policy-card')
		.first()
	await policyCard.getByRole('textbox', { name: 'Identifier' }).fill('shared-upload')
	await policyCard.getByRole('textbox', { name: 'Start (RFC3339)' }).fill('2026-03-10T00:00:00Z')
	await policyCard.getByRole('textbox', { name: 'Expiry (RFC3339)' }).fill('2026-03-20T00:00:00Z')
	await policyCard.getByLabel('Read').check()
	await policyCard.getByLabel('Write').check()
	await accessSection.getByRole('button', { name: 'Save' }).click()

	await expect.poll(() => accessBodies.length).toBe(1)
	expect(accessBodies[0]).toEqual({
		storedAccessPolicies: [
			{
				id: 'shared-upload',
				start: '2026-03-10T00:00:00Z',
				expiry: '2026-03-20T00:00:00Z',
				permission: 'rw',
			},
		],
	})
	await expect(page.locator('#a11y-status')).toHaveText('Stored access policies updated')
	await expect(page.getByText('Refreshing', { exact: true })).toHaveCount(0)
})


test('OCI sharing keeps the creation URL after refreshing and clears it when closed', async ({ page }) => {
	let submitted: unknown
	const accessUri = 'https://example.com/test-created-par'
	await seedBucketsPage({
		page,
		profile: { id: profileId, provider: 'oci_object_storage', name: 'Test OCI', createdAt: now, updatedAt: now },
		governance: {
			provider: 'oci_object_storage', bucket,
			capabilities: { bucket_sharing: { enabled: true } },
			sharing: { provider: 'oci_object_storage', bucket, preauthenticatedSupport: true, preauthenticatedRequests: [] },
		},
		onPutSharing: (body) => {
			submitted = body
			return {
				provider: 'oci_object_storage', bucket, preauthenticatedSupport: true,
				preauthenticatedRequests: [{
					id: 'new-par', name: 'Download link', accessType: 'AnyObjectRead',
					bucketListingAction: 'Deny', objectName: '', timeCreated: now,
					timeExpires: '2027-01-01T00:00:00Z', accessUri,
				}],
			}
		},
	})
	await openControls(page)
	const section = page.getByTestId('bucket-governance-sharing')
	await section.getByRole('button', { name: 'Add PAR' }).click()
	await section.getByRole('textbox', { name: 'Name', exact: true }).fill('Download link')
	await section.getByRole('textbox', { name: 'Expires at (RFC3339)' }).fill('2027-01-01T00:00:00Z')
	await section.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(section.getByRole('textbox', { name: 'Name', exact: true })).toBeDisabled()
	await expect(page.getByText('Refreshing', { exact: true })).toHaveCount(0)
	await expect(section.getByText(accessUri, { exact: true })).toBeVisible()
	expect(submitted).toEqual({ preauthenticatedRequests: [{
		name: 'Download link', accessType: 'AnyObjectRead', bucketListingAction: 'Deny',
		timeExpires: '2027-01-01T00:00:00Z',
	}] })
	await page.getByRole('button', { name: 'Close', exact: true }).last().click()
	await expect(section).toHaveCount(0)
	await clickBucketCardManageAction(page, page.locator('body'), bucket, /Controls/)
	await expect(section.getByRole('textbox', { name: 'Name', exact: true })).toHaveValue('Download link')
	await expect(section.getByText(accessUri, { exact: true })).toHaveCount(0)
})


test('provider validation only describes the current policy draft', async ({ page }) => {
	let finishFirst!: () => void
	const pending = new Promise<void>((resolve) => { finishFirst = resolve })
	const requests: unknown[] = []
	await seedBucketsPage({
		page,
		profile: { id: profileId, provider: 'aws_s3', name: 'Test AWS', createdAt: now, updatedAt: now },
		governance: { provider: 'aws_s3', bucket },
		onValidatePolicy: async (body) => {
			requests.push(body)
			if (requests.length === 1) await pending
			return { ok: true, provider: 'aws_s3', errors: [], warnings: [] }
		},
	})
	await gotoBucketsPage(page, { ready: (scope) => scope.getByText(bucket) })
	await clickBucketCardManageAction(page, page.locator('body'), bucket, /Policy editor/)
	const editor = page.getByRole('textbox', { name: 'Raw policy JSON' })
	const validate = page.getByRole('button', { name: 'Validate with provider' })
	await validate.click()
	await expect.poll(() => requests.length).toBe(1)
	const draft = { Version: '2012-10-17', Statement: [], Id: 'changed-draft' }
	await editor.fill(JSON.stringify(draft))
	finishFirst()
	await expect(validate).toBeEnabled()
	await expect(page.getByText('Server validation OK', { exact: true })).toHaveCount(0)
	await expect(editor).toHaveValue(JSON.stringify(draft))
	await validate.click()
	await expect(page.getByText('Server validation OK', { exact: true })).toBeVisible()
	expect(requests).toEqual([{ policy: {} }, { policy: draft }])
})


for (const surface of ['controls', 'policy'] as const) {
	test(`retries ${surface} loading without reopening the dialog`, async ({ page }) => {
		let unavailable = true
		await seedBucketsPage({
			page,
			profile: { id: profileId, provider: 'aws_s3', name: 'Test AWS', createdAt: now, updatedAt: now },
			governance: { provider: 'aws_s3', bucket, publicExposure: { mode: 'private' } },
			settingsUnavailable: () => unavailable,
		})
		await gotoBucketsPage(page, { ready: (scope) => scope.getByText(bucket) })
		await clickBucketCardManageAction(page, page.locator('body'), bucket, surface === 'controls' ? /Controls/ : /Policy editor/)
		const retry = page.getByRole('button', { name: `Retry loading ${surface}` })
		await expect(retry).toBeVisible({ timeout: 15000 })
		unavailable = false
		await retry.click()
		await expect(retry).toHaveCount(0)
		if (surface === 'controls') await expect(page.getByTestId('bucket-governance-public-exposure')).toBeVisible()
		else await expect(page.getByRole('textbox', { name: 'Raw policy JSON' })).toBeVisible()
	})
}

test('policy draft survives a failed reconnect refresh and retry', async ({ page }) => {
	let unavailable = false
	let savedPolicy: unknown
	await seedBucketsPage({
		page,
		profile: { id: profileId, provider: 'aws_s3', name: 'Test AWS', createdAt: now, updatedAt: now },
		governance: { provider: 'aws_s3', bucket },
		settingsUnavailable: () => unavailable,
		onPutPolicy: (body) => { savedPolicy = body },
	})
	await gotoBucketsPage(page, { ready: (scope) => scope.getByText(bucket) })
	await clickBucketCardManageAction(page, page.locator('body'), bucket, /Policy editor/)
	const editor = page.getByRole('textbox', { name: 'Raw policy JSON' })
	const draft = '{"Id":"keep-my-draft","Statement":[]}'
	await editor.fill(draft)
	unavailable = true
	await page.clock.install()
	await page.evaluate(() => window.dispatchEvent(new Event('offline')))
	await page.clock.fastForward(31000)
	await page.evaluate(() => window.dispatchEvent(new Event('online')))
	const retry = page.getByRole('button', { name: 'Retry loading policy' })
	await expect(retry).toBeVisible({ timeout: 15000 })
	await expect(editor).toHaveValue(draft)
	unavailable = false
	await retry.click()
	await expect(retry).toHaveCount(0)
	await expect(editor).toHaveValue(draft)
	await page.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(editor).toHaveCount(0)
	expect(savedPolicy).toEqual({ policy: JSON.parse(draft) })
})
