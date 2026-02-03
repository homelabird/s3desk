import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ProfilesPage', () => {
	it('renders without crashing', () => {
		vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([])
		vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
			version: 'test',
			serverAddr: '127.0.0.1:8080',
			dataDir: '/tmp',
			staticDir: '/tmp',
			apiTokenEnabled: false,
			encryptionEnabled: false,
			capabilities: { profileTls: { enabled: false, reason: 'test' } },
			allowedLocalDirs: [],
			jobConcurrency: 1,
			jobLogMaxBytes: null,
			jobRetentionSeconds: null,
			uploadSessionTTLSeconds: 3600,
			uploadMaxBytes: null,
			transferEngine: {
				name: 'rclone',
				available: true,
				compatible: true,
				minVersion: '1.52.0',
				path: '/usr/local/bin/rclone',
				version: 'v1.66.0',
			},
		})

		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Profiles')).toBeInTheDocument()
	})
})
