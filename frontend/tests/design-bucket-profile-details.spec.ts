import { expect, test, type Page } from '@playwright/test'

import { buildMetaFixture, buildProfileFixture, seedLocalStorage } from './support/apiFixtures'
import {
	buildAwsGovernanceFixture,
	installProfilesBucketsMobileResponsiveFixtures,
	seedProfilesBucketsMobileResponsiveStorage,
} from './support/profilesBucketsMobileResponsive'
import { clickBucketCardManageAction, gotoBucketsPage, gotoProfilesPage } from './support/ui'

const profileId = 'profiles-buckets-mobile-profile'
const bucket = 'responsive-bucket'

function deferred() {
	let resolve!: () => void
	const promise = new Promise<void>((done) => { resolve = done })
	return { promise, resolve }
}

async function seedBucketDetails(page: Page) {
	await installProfilesBucketsMobileResponsiveFixtures(page, {
		profileProvider: 'aws_s3',
		bucketPolicy: { Version: '2012-10-17', Statement: [] },
		bucketGovernance: buildAwsGovernanceFixture(bucket),
	})
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await seedLocalStorage(page, { apiRetryCount: 0 })
}

test('policy keeps its sheet while a write is pending at 320px (light)', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 320, height: 900 })
	await seedBucketDetails(page)
	await seedLocalStorage(page, { themeMode: 'light' })
	let policy = { Version: '2012-10-17', Statement: [] as unknown[], Id: '' }
	let writes = 0
	const pending = deferred()
	await page.route(`**/api/v1/buckets/${bucket}/policy`, async (route) => {
		if (route.request().method() === 'GET') return route.fulfill({ json: { bucket, exists: true, policy } })
		if (route.request().method() !== 'PUT') return route.fallback()
		writes += 1
		await pending.promise
		policy = route.request().postDataJSON().policy
		return route.fulfill({ status: 204 })
	})
	try {
		await gotoBucketsPage(page)
		await clickBucketCardManageAction(page, page.locator('body'), bucket, /Policy/)
		const dialog = page.getByRole('dialog', { name: `Policy: ${bucket}`, exact: true })
		await dialog.getByRole('textbox', { name: 'Raw policy JSON', exact: true }).fill(JSON.stringify({ ...policy, Id: 'reviewed-draft' }))
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
		await expect.poll(() => writes).toBe(1)
		await expect(dialog.getByRole('button', { name: 'Cancel', exact: true })).toBeDisabled()
		const controls = dialog.getByRole('button', { name: 'Open Controls', exact: true })
		await controls.scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath('policy-pending-navigation.png'), animations: 'disabled' })
		await expect(controls).toBeDisabled()
		pending.resolve()
		await expect(dialog).toHaveCount(0)
		expect(writes).toBe(1)
	} finally {
		pending.resolve()
	}
})

test('controls keep their sheet while a write is pending at 1280px (dark)', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 })
	await seedBucketDetails(page)
	await seedLocalStorage(page, { themeMode: 'dark' })
	let writes = 0
	const pending = deferred()
	await page.route(`**/api/v1/buckets/${bucket}/governance/public-exposure`, async (route) => {
		if (route.request().method() !== 'PUT') return route.fallback()
		writes += 1
		await pending.promise
		return route.fulfill({ status: 204 })
	})
	try {
		await gotoBucketsPage(page)
		await clickBucketCardManageAction(page, page.locator('body'), bucket, /Controls/)
		const dialog = page.getByRole('dialog', { name: `Controls: ${bucket}`, exact: true })
		const rawPolicy = dialog.locator('summary').filter({ hasText: 'Raw policy editor' })
		await rawPolicy.click()
		const exposure = dialog.getByTestId('bucket-governance-public-exposure')
		await exposure.getByRole('switch', { name: 'Block public ACLs', exact: true }).click()
		await exposure.getByRole('button', { name: 'Save', exact: true }).click()
		await page.getByRole('button', { name: 'Apply changes', exact: true }).click()
		await expect.poll(() => writes).toBe(1)
		await expect(dialog.getByRole('button', { name: 'Close', exact: true }).last()).toBeDisabled()
		const policy = dialog.getByRole('button', { name: 'Open Policy', exact: true })
		await policy.scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath('controls-pending-navigation.png'), animations: 'disabled' })
		await expect(policy).toBeDisabled()
		pending.resolve()
		await expect(policy).toBeEnabled()
		await policy.click()
		await expect(page.getByRole('dialog', { name: `Policy: ${bucket}`, exact: true })).toBeVisible()
		expect(writes).toBe(1)
	} finally {
		pending.resolve()
	}
})

async function seedProfileEdit(page: Page) {
	let profile = buildProfileFixture({ id: profileId, name: 'TLS Profile', tlsInsecureSkipVerify: false })
	await installProfilesBucketsMobileResponsiveFixtures(page, { profiles: [profile] })
	await seedProfilesBucketsMobileResponsiveStorage(page)
	await seedLocalStorage(page, { apiRetryCount: 0 })
	const meta = buildMetaFixture()
	await page.route('**/api/v1/meta', (route) => route.fulfill({ json: {
		...meta, capabilities: { ...meta.capabilities, profileTls: { enabled: true } },
	} }))
	await page.route('**/api/v1/profiles', (route) => route.request().method() === 'GET'
		? route.fulfill({ json: [profile] }) : route.fallback())
	const updates: unknown[] = []
	await page.route(`**/api/v1/profiles/${profileId}`, (route) => {
		if (route.request().method() !== 'PATCH') return route.fallback()
		const body = route.request().postDataJSON()
		updates.push(body)
		profile = { ...profile, ...body }
		return route.fulfill({ json: profile })
	})
	return { updates }
}

async function openTLSChange(page: Page) {
	await gotoProfilesPage(page)
	await page.getByRole('button', { name: 'Profile tools for TLS Profile', exact: true }).click()
	await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
	const dialog = page.getByRole('dialog', { name: 'Edit Profile', exact: true })
	await dialog.getByLabel(/^Name/).fill('Updated TLS Profile')
	await dialog.locator('summary').filter({ hasText: 'TLS' }).click()
	await dialog.getByLabel('mTLS action', { exact: true }).selectOption('disable')
	return dialog
}

test('profile edit waits for the mTLS write before reporting success at 1280px (dark)', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 1280, height: 900 })
	const { updates } = await seedProfileEdit(page)
	await seedLocalStorage(page, { themeMode: 'dark' })
	let tlsWrites = 0
	const pending = deferred()
	await page.route(`**/api/v1/profiles/${profileId}/tls`, async (route) => {
		if (route.request().method() === 'GET') return route.fulfill({ json: { mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false } })
		if (route.request().method() !== 'DELETE') return route.fallback()
		tlsWrites += 1
		await pending.promise
		return route.fulfill({ status: 204 })
	})
	try {
		const dialog = await openTLSChange(page)
		await dialog.getByRole('button', { name: 'Save', exact: true }).click()
		await expect.poll(() => tlsWrites).toBe(1)
		await page.screenshot({ path: testInfo.outputPath('profile-tls-pending.png'), animations: 'disabled' })
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel(/^Name/)).toHaveValue('Updated TLS Profile')
		await expect(dialog.getByLabel(/^Name/)).toBeDisabled()
		await expect(dialog.getByRole('button', { name: /Save$/ })).toBeDisabled()
		await expect(page.getByText('Profile updated', { exact: true })).toHaveCount(0)
		pending.resolve()
		await expect(dialog).toHaveCount(0)
		await expect(page.locator('.ant-message-notice-success').getByText('Profile updated', { exact: true })).toBeVisible()
		expect(updates).toHaveLength(1)
		expect(tlsWrites).toBe(1)
	} finally {
		pending.resolve()
	}
})

test('profile edit keeps a partial mTLS error and draft available for retry at 320px (light)', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 320, height: 900 })
	const { updates } = await seedProfileEdit(page)
	await seedLocalStorage(page, { themeMode: 'light' })
	let tlsWrites = 0
	await page.route(`**/api/v1/profiles/${profileId}/tls`, (route) => {
		if (route.request().method() === 'GET') return route.fulfill({ json: { mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false } })
		if (route.request().method() !== 'DELETE') return route.fallback()
		tlsWrites += 1
		return tlsWrites === 1
			? route.fulfill({ status: 503, json: { error: { code: 'upstream_unavailable', message: 'mTLS temporarily unavailable' } } })
			: route.fulfill({ status: 204 })
	})
	const dialog = await openTLSChange(page)
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(page.getByText(/mTLS temporarily unavailable/).first()).toBeVisible()
	await page.screenshot({ path: testInfo.outputPath('profile-tls-partial-error.png'), animations: 'disabled' })
	await expect(dialog).toBeVisible()
	const error = dialog.getByRole('alert').filter({ hasText: 'Profile settings saved, but mTLS update failed.' })
	await expect(error).toBeVisible()
	await expect(error).toContainText('mTLS temporarily unavailable')
	await expect(dialog.getByLabel(/^Name/)).toHaveValue('Updated TLS Profile')
	await expect(dialog.getByLabel('mTLS action', { exact: true })).toHaveValue('disable')
	await expect(dialog.getByRole('button', { name: 'Save', exact: true })).toBeEnabled()
	await expect(page.locator('.ant-message-notice-error')).toHaveCount(0, { timeout: 10_000 })
	await expect(error).toBeVisible()
	await dialog.getByRole('button', { name: 'Save', exact: true }).click()
	await expect(dialog).toHaveCount(0)
	await expect(page.locator('.ant-message-notice-success').getByText('Profile updated', { exact: true })).toBeVisible()
	expect(updates).toHaveLength(2)
	expect(tlsWrites).toBe(2)
})

for (const { provider, providerLabel, width, themeMode, publicMode } of [
	{ provider: 'gcp_gcs', providerLabel: 'GCS', width: 320, themeMode: 'light', publicMode: 'public' },
	{ provider: 'azure_blob', providerLabel: 'Azure', width: 1280, themeMode: 'dark', publicMode: 'container' },
] as const) {
	test(`${providerLabel} create feedback matches exposure and clears removed-row errors at ${width}px (${themeMode})`, async ({ page }, testInfo) => {
		await page.setViewportSize({ width, height: 900 })
		await installProfilesBucketsMobileResponsiveFixtures(page, {
			profileProvider: provider,
			...(provider === 'gcp_gcs' ? {
				profiles: [buildProfileFixture({ id: profileId, name: 'Responsive Profile', provider, projectNumber: '123456789012' })],
			} : {}),
		})
		await seedProfilesBucketsMobileResponsiveStorage(page)
		await seedLocalStorage(page, { themeMode, apiRetryCount: 0 })
		const createdBucket = `${providerLabel.toLowerCase()}-feedback-bucket`
		const creates: unknown[] = []
		await page.route('**/api/v1/buckets', (route) => {
			if (route.request().method() === 'POST') {
				creates.push(route.request().postDataJSON())
				return route.fulfill({ status: 201, json: { name: createdBucket } })
			}
			return route.fulfill({ json: [{ name: bucket }, ...(creates.length ? [{ name: createdBucket }] : [])] })
		})
		await gotoBucketsPage(page)
		await page.getByRole('button', { name: 'New Bucket', exact: true }).click()
		const dialog = page.getByRole('dialog', { name: 'Create Bucket', exact: true })
		await dialog.getByLabel(/^Bucket name/).fill(createdBucket)
		await dialog.getByRole('switch', { name: `Apply recommended ${providerLabel} secure defaults`, exact: true }).click()
		const exposure = dialog.getByRole('combobox', { name: provider === 'gcp_gcs' ? 'GCS access mode' : 'Azure visibility', exact: true })
		await expect(dialog.getByText('Private baseline', { exact: true })).toBeVisible()
		await exposure.selectOption(publicMode)
		await dialog.getByLabel(/^Bucket name/).scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath(`${providerLabel.toLowerCase()}-create-public-feedback.png`), animations: 'disabled' })
		await expect.soft(dialog.getByText('Private baseline', { exact: true })).toHaveCount(0)
		await exposure.selectOption('private')
		await expect(dialog.getByText('Private baseline', { exact: true })).toBeVisible()
		await exposure.selectOption(publicMode)
		const isGCS = provider === 'gcp_gcs'
		await dialog.getByRole('switch', { name: isGCS ? 'Seed GCS IAM bindings during creation' : 'Seed Azure stored access policies during creation', exact: true }).click()
		const addRow = dialog.getByRole('button', { name: isGCS ? /Add binding$/ : /Add stored access policy$/ })
		await addRow.click()
		if (isGCS) {
			await dialog.getByRole('textbox', { name: 'GCS binding 1 role', exact: true }).fill('roles/storage.objectViewer')
			await dialog.getByRole('textbox', { name: 'GCS binding 1 members', exact: true }).fill('user:ops@example.com')
		} else {
			await dialog.getByRole('textbox', { name: 'Azure stored access policy 1 id', exact: true }).fill('readonly')
			await dialog.getByRole('textbox', { name: 'Azure stored access policy 1 permission', exact: true }).fill('r')
		}
		await addRow.click()
		await dialog.getByRole('textbox', { name: isGCS ? 'GCS binding 2 role' : 'Azure stored access policy 2 permission', exact: true }).fill(isGCS ? 'roles/storage.objectViewer' : 'r')
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		const error = dialog.getByRole('alert').filter({ hasText: 'Secure defaults are invalid' })
		await expect(error).toBeVisible()
		await error.scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath(`${providerLabel.toLowerCase()}-create-invalid-row.png`), animations: 'disabled' })
		expect(creates).toHaveLength(0)
		await dialog.getByRole('button', { name: 'Remove', exact: true }).nth(1).click()
		await dialog.getByLabel(/^Bucket name/).scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath(`${providerLabel.toLowerCase()}-create-removed-row.png`), animations: 'disabled' })
		await expect.soft(error).toHaveCount(0)
		await expect(dialog.getByRole('textbox', { name: isGCS ? 'GCS binding 1 role' : 'Azure stored access policy 1 id', exact: true })).toHaveValue(isGCS ? 'roles/storage.objectViewer' : 'readonly')
		await dialog.getByRole('button', { name: 'Create', exact: true }).click()
		await expect(dialog).toHaveCount(0)
		expect(creates).toEqual([expect.objectContaining({
			name: createdBucket,
			defaults: expect.objectContaining({
				publicExposure: expect.objectContaining({ mode: publicMode }),
				access: isGCS
					? { bindings: [{ role: 'roles/storage.objectViewer', members: ['user:ops@example.com'] }] }
					: { storedAccessPolicies: [{ id: 'readonly', permission: 'r' }] },
			}),
		})])
	})
}

test('TLS status retry preserves the edit draft through pending and recovery at 320px (light)', async ({ page }, testInfo) => {
	await page.setViewportSize({ width: 320, height: 900 })
	const { updates } = await seedProfileEdit(page)
	await seedLocalStorage(page, { themeMode: 'light' })
	let retryAllowed = false
	let retryReads = 0
	let tlsWrites = 0
	const pending = deferred()
	await page.route(`**/api/v1/profiles/${profileId}/tls`, async (route) => {
		if (route.request().method() !== 'GET') {
			tlsWrites += 1
			return route.fallback()
		}
		if (!retryAllowed) return route.fulfill({ status: 503, json: { error: { code: 'upstream_unavailable', message: 'TLS status temporarily unavailable' } } })
		retryReads += 1
		await pending.promise
		return route.fulfill({ json: { mode: 'mtls', hasClientCert: true, hasClientKey: true, hasCa: false } })
	})
	try {
		await gotoProfilesPage(page)
		await page.getByRole('button', { name: 'Profile tools for TLS Profile', exact: true }).click()
		await page.getByRole('menuitem', { name: 'Edit', exact: true }).click()
		const dialog = page.getByRole('dialog', { name: 'Edit Profile', exact: true })
		await dialog.getByLabel(/^Name/).fill('Preserved TLS draft')
		const tlsSummary = dialog.locator('summary').filter({ hasText: 'TLS' })
		await tlsSummary.click()
		const error = dialog.getByRole('alert').filter({ hasText: 'Failed to load TLS status' })
		await expect(error).toContainText('TLS status temporarily unavailable', { timeout: 30_000 })
		await expect(tlsSummary).toContainText('Status unknown')
		await error.scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath('profile-tls-status-error.png'), animations: 'disabled' })
		const retry = dialog.getByRole('button', { name: /Retry TLS status$/ })
		await expect(retry).toBeEnabled()
		retryAllowed = true
		await retry.click()
		await expect.poll(() => retryReads).toBe(1)
		await expect(retry).toBeDisabled()
		await expect(error).toContainText('TLS status temporarily unavailable')
		await expect(tlsSummary).toContainText('Checking')
		await page.screenshot({ path: testInfo.outputPath('profile-tls-status-retry.png'), animations: 'disabled' })
		await expect(dialog.getByLabel(/^Name/)).toHaveValue('Preserved TLS draft')
		await expect(dialog.getByLabel('mTLS action', { exact: true })).toHaveValue('keep')
		pending.resolve()
		await expect(error).toHaveCount(0)
		await expect(tlsSummary).toContainText('mTLS enabled')
		await expect(dialog.getByLabel(/^Name/)).toHaveValue('Preserved TLS draft')
		await expect(dialog.getByLabel('mTLS action', { exact: true })).toHaveValue('keep')
		await tlsSummary.scrollIntoViewIfNeeded()
		await page.screenshot({ path: testInfo.outputPath('profile-tls-status-recovered.png'), animations: 'disabled' })
		expect(retryReads).toBe(1)
		expect(tlsWrites).toBe(0)
		expect(updates).toHaveLength(0)
	} finally {
		pending.resolve()
	}
})
