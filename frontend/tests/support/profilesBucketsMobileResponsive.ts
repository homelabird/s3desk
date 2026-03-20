import type { Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'profiles-buckets-mobile-token',
	profileId: 'profiles-buckets-mobile-profile',
	bucket: 'responsive-bucket',
}

const now = '2024-01-01T00:00:00Z'

export async function seedProfilesBucketsMobileResponsiveStorage(page: Page, overrides: Partial<StorageSeed> = {}) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

export async function installProfilesBucketsMobileResponsiveFixtures(page: Page) {
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
				id: defaultStorage.profileId,
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
			{
				id: 'profiles-buckets-mobile-secondary',
				name: 'Backup Profile',
				provider: 's3_compatible',
				endpoint: 'http://localhost:9001',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [
			{ name: defaultStorage.bucket, createdAt: now },
			{ name: 'logs-bucket', createdAt: now },
		]),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}
