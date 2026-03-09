import { expect, test, type Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage } from './support/apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string | null
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'change-me',
	profileId: 'playwright-responsive',
	bucket: 'responsive-bucket',
}

async function seedStorage(page: Page, overrides?: Partial<StorageSeed>) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

async function stubCoreApi(page: Page, overrides?: Partial<StorageSeed>) {
	const seed = { ...defaultStorage, ...overrides }
	const now = '2024-01-01T00:00:00Z'

	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'test' }, providers: {} },
				allowedLocalDirs: [],
				uploadSessionTTLSeconds: 86400,
				uploadDirectStream: false,
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: 'v1.66.0',
					path: '/usr/local/bin/rclone',
					version: 'v1.66.0',
				},
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: seed.profileId,
				name: 'Responsive Profile',
				provider: 's3_compatible',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [
			{ name: seed.bucket, createdAt: now },
			{ name: 'logs-bucket', createdAt: now },
		]),
		jsonFixture('GET', '/api/v1/jobs', { items: [], nextCursor: null }),
	], { status: 200, json: {} })
}

test.describe('responsive list layouts', () => {
	test('profiles switch to compact cards below desktop breakpoint', async ({ page }) => {
		await page.setViewportSize({ width: 820, height: 900 })
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/profiles')

		await expect(page.getByTestId('profiles-list-compact')).toBeVisible()
		await expect(page.getByTestId('profiles-table-desktop')).toHaveCount(0)
		await expect(page.getByRole('button', { name: /Selected|Use profile/ })).toBeVisible()
	})

	test('buckets switch to compact cards below desktop breakpoint', async ({ page }) => {
		await page.setViewportSize({ width: 820, height: 900 })
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/buckets')

		await expect(page.getByTestId('buckets-list-compact')).toBeVisible()
		await expect(page.getByTestId('buckets-table-desktop')).toHaveCount(0)
		await expect(page.getByRole('button', { name: 'Policy' }).first()).toBeVisible()
	})

	test('profiles and buckets keep tables on wide desktop', async ({ page }) => {
		await page.setViewportSize({ width: 1200, height: 900 })
		await stubCoreApi(page)
		await seedStorage(page)
		await page.goto('/profiles')

		await expect(page.getByTestId('profiles-table-desktop')).toBeVisible()
		await expect(page.getByTestId('profiles-list-compact')).toHaveCount(0)

		await page.goto('/buckets')
		await expect(page.getByTestId('buckets-table-desktop')).toBeVisible()
		await expect(page.getByTestId('buckets-list-compact')).toHaveCount(0)
	})
})
