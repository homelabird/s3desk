import type { Page } from '@playwright/test'

import { installApiFixtures, jsonFixture, metaJson, seedLocalStorage, textFixture } from './apiFixtures'

const now = '2024-01-01T00:00:00Z'
const profileId = 'settings-mobile-profile'

export async function seedSettingsMobileResponsiveStorage(page: Page) {
	await seedLocalStorage(page, {
		apiToken: 'valid-token',
		profileId,
		bucket: 'settings-mobile-bucket',
	})
}

export async function installSettingsMobileResponsiveFixtures(page: Page) {
	await installApiFixtures(page, [
		jsonFixture('GET', '/api/v1/meta', metaJson()),
		jsonFixture('GET', '/api/v1/profiles', [
			{
				id: profileId,
				name: 'Settings Mobile Profile',
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
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}

export async function seedLoginMobileResponsiveStorage(page: Page, apiToken = '') {
	await seedLocalStorage(page, {
		apiToken,
		profileId: null,
	})
}

export async function installLoginMobileResponsiveFixtures(page: Page, validTokens: string[]) {
	await installApiFixtures(page, [
		{
			method: 'GET',
			path: '/api/v1/meta',
			handler: ({ request }) => {
				const token = request.headers()['x-api-token'] ?? ''
				if (!validTokens.includes(token)) {
					return { status: 401, json: { error: { code: 'unauthorized', message: 'invalid token' } } }
				}
				return { json: metaJson() }
			},
		},
		jsonFixture('GET', '/api/v1/profiles', []),
		textFixture('GET', '/api/v1/events', 'forbidden', { status: 403, contentType: 'text/plain' }),
	])
}
