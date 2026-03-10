import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, metaJson, seedLocalStorage } from './support/apiFixtures'

const now = '2026-03-10T00:00:00Z'
const profileId = 'governance-profile'
const bucket = 'governance-bucket'

async function seedBucketsPage(args: {
	page: Page
	profile: Record<string, unknown>
	governance: Record<string, unknown>
	onPutAccess?: (body: unknown) => void
}) {
	let currentGovernance = structuredClone(args.governance)
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
			method: 'GET',
			path: `/buckets/${bucket}/governance`,
			handler: () => ({
				json: currentGovernance,
			}),
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
		profileId,
		bucket,
	})
}

async function openControls(page: Page) {
	await page.goto('/buckets')
	await expect(page.getByText(bucket)).toBeVisible()
	await page.getByRole('button', { name: /controls/i }).first().click()
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
})
