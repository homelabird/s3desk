import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

vi.mock('../profiles/profilesLazy', () => ({
	ProfilesModals: ({
		createOpen,
		editProfile,
		yamlOpen,
		importOpen,
	}: {
		createOpen: boolean
		editProfile: unknown
		yamlOpen: boolean
		importOpen: boolean
	}) => (
		<div data-testid="profiles-modals">
			{createOpen ? 'create-open' : 'create-closed'}
			{editProfile ? ' edit-open' : ''}
			{yamlOpen ? ' yaml-open' : ''}
			{importOpen ? ' import-open' : ''}
		</div>
	),
}))

beforeAll(() => {
	ensureDomShims()
})

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})
}

function mockProfilesPageBase() {
	vi.spyOn(APIClient.prototype, 'getMeta').mockResolvedValue({
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		staticDir: '/app/ui',
		apiTokenEnabled: false,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'test' },
			providers: {},
		},
		allowedLocalDirs: [],
		jobConcurrency: 1,
		uploadSessionTTLSeconds: 3600,
		uploadDirectStream: false,
		transferEngine: { name: 'rclone', available: true, compatible: true, minVersion: '1.52.0', path: '/usr/bin/rclone', version: 'v1.66.0' },
	} as never)
	vi.spyOn(APIClient.prototype, 'listProfiles').mockResolvedValue([
		{
			id: 'profile-1',
			name: 'Primary Profile',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: false,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		},
	] as never)
}

describe('ProfilesPage lazy modals', () => {
	beforeEach(() => {
		vi.restoreAllMocks()
		mockProfilesPageBase()
	})

	it('does not mount modal container until a modal is opened', async () => {
		render(
			<QueryClientProvider client={createClient()}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.queryByTestId('profiles-modals')).not.toBeInTheDocument()
		fireEvent.click(await screen.findByRole('button', { name: 'New Profile' }))
		expect(screen.getByTestId('profiles-modals')).toHaveTextContent('create-open')
	})
})
