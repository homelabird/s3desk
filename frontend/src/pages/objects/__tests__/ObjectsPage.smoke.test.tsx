import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../../api/client'
import { APIClientProvider } from '../../../api/APIClientProvider'
import { AuthProvider } from '../../../auth/AuthProvider'
import { TransfersContext } from '../../../components/useTransfers'
import { profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { ensureDomShims } from '../../../test/domShims'
import { transfersStub } from '../../../test/transfersStub'
import { ObjectsPage } from '../../ObjectsPage'

beforeAll(() => {
	ensureDomShims()
})

beforeEach(() => {
	window.localStorage.clear()
	window.localStorage.setItem(profileScopedStorageKey('objects', 'token', 'profile-1', 'bucket'), JSON.stringify('bucket-a'))

	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
		getMeta: vi.fn().mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/data',
			staticDir: '/app/ui',
			apiTokenEnabled: true,
			encryptionEnabled: false,
			dbBackend: 'sqlite',
			warnings: [],
			capabilities: {
				profileTls: { enabled: false, reason: 'test' },
				providers: {},
			},
			allowedLocalDirs: [],
			jobConcurrency: 1,
			uploadSessionTTLSeconds: 3600,
			uploadDirectStream: false,
			transferEngine: {
				name: 'rclone',
				available: true,
				compatible: true,
				minVersion: '1.52.0',
				path: '/usr/bin/rclone',
				version: 'v1.66.0',
			},
		}),
	} as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
		listProfiles: vi.fn().mockResolvedValue([
			{
				id: 'profile-1',
				name: 'Primary Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: true,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			},
		]),
	} as never)
	vi.spyOn(APIClient.prototype, 'buckets', 'get').mockReturnValue({
		listBuckets: vi.fn().mockResolvedValue([{ name: 'bucket-a', createdAt: '2024-01-01T00:00:00Z' }]),
	} as never)
	vi.spyOn(APIClient.prototype, 'objects', 'get').mockReturnValue({
		listObjects: vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			items: [],
			commonPrefixes: [],
			isTruncated: false,
			nextContinuationToken: null,
		}),
		listObjectFavorites: vi.fn().mockResolvedValue({
			bucket: 'bucket-a',
			prefix: '',
			count: 0,
			keys: [],
			items: [],
			hydrated: false,
		}),
	} as never)
	vi.spyOn(APIClient.prototype, 'jobs', 'get').mockReturnValue({
		createJob: vi.fn(),
	} as never)
})

afterEach(() => {
	vi.restoreAllMocks()
	window.localStorage.clear()
})

describe('ObjectsPage', () => {
	it('toggles sort direction from list header', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<AuthProvider>
					<APIClientProvider>
						<TransfersContext.Provider value={transfersStub}>
							<MemoryRouter>
								<ObjectsPage apiToken="token" profileId="profile-1" />
							</MemoryRouter>
						</TransfersContext.Provider>
					</APIClientProvider>
				</AuthProvider>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Objects')).toBeInTheDocument()
		fireEvent.click(await screen.findByRole('button', { name: /Name/i }, { timeout: 5_000 }))
		expect(await screen.findByRole('button', { name: /Name/i }, { timeout: 5_000 })).toHaveAccessibleName(/Name caret-down/i)
	}, 15_000)
})
