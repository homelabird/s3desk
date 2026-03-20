import type { Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'uploads-mobile-token',
	profileId: 'uploads-mobile-profile',
	bucket: 'uploads-mobile-bucket',
}

const now = '2024-01-01T00:00:00Z'

export async function seedUploadsMobileResponsiveStorage(page: Page, overrides: Partial<StorageSeed> = {}) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

export async function installUploadsMobileResponsiveFixtures(page: Page) {
	await installApiFixtures(page, [
		jsonFixture(
			'GET',
			'/api/v1/meta',
			metaJson({
				dataDir: '/tmp',
				staticDir: '/tmp',
				capabilities: { profileTls: { enabled: false, reason: 'ENCRYPTION_KEY is required to store mTLS material' } },
				allowedLocalDirs: [],
				jobLogMaxBytes: null,
				jobRetentionSeconds: null,
				uploadSessionTTLSeconds: 86400,
				uploadMaxBytes: null,
			}),
		),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: defaultStorage.profileId,
				provider: 's3_compatible',
				name: 'Uploads Mobile Profile',
				endpoint: 'http://localhost:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				tlsInsecureSkipVerify: true,
				createdAt: now,
				updatedAt: now,
			},
		]),
		jsonFixture('GET', '/api/v1/buckets', [{ name: defaultStorage.bucket, createdAt: now }]),
		textFixture('GET', '/api/v1/events', '', { headers: { 'content-type': 'text/event-stream' } }),
	])
}
