import type { Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './apiFixtures'

type StorageSeed = {
	apiToken: string
	profileId: string
	bucket: string
}

const defaultStorage: StorageSeed = {
	apiToken: 'jobs-mobile-token',
	profileId: 'jobs-mobile-profile',
	bucket: 'jobs-mobile-bucket',
}

const now = '2024-01-01T00:00:00Z'

const jobs = [
	{
		id: 'job-queued',
		type: 'transfer_upload',
		status: 'queued',
		payload: { bucket: defaultStorage.bucket, prefix: 'queued/' },
		progress: null,
		createdAt: now,
		startedAt: null,
		finishedAt: null,
		error: null,
	},
	{
		id: 'job-running',
		type: 'transfer_delete_prefix',
		status: 'running',
		payload: { bucket: defaultStorage.bucket, prefix: 'running/' },
		progress: null,
		createdAt: now,
		startedAt: now,
		finishedAt: null,
		error: null,
	},
]

export async function seedJobsMobileResponsiveStorage(page: Page, overrides: Partial<StorageSeed> = {}) {
	await seedLocalStorage(page, { ...defaultStorage, ...overrides })
}

export async function installJobsMobileResponsiveFixtures(page: Page) {
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
				name: 'Jobs Mobile Profile',
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
		jsonFixture('GET', '/api/v1/buckets', [{ name: defaultStorage.bucket, createdAt: now }]),
		jsonFixture('GET', '/api/v1/jobs', { items: jobs, nextCursor: null }),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}
