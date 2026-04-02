import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

vi.mock('../../api/useAPIClient', async () => {
	const { APIClient } = await import('../../api/client')
	return {
		useAPIClient: () => new APIClient({ apiToken: 'test-token' }),
	}
})

vi.mock('../profiles/profilesLazy', () => ({
	ProfilesModals: ({
		createOpen,
		closeCreateModal,
		editProfile,
		yamlOpen,
		importOpen,
	}: {
		createOpen: boolean
		closeCreateModal: () => void
		editProfile: unknown
		yamlOpen: boolean
		importOpen: boolean
	}) => (
		<div data-testid="profiles-modals">
			{createOpen ? 'create-open' : 'create-closed'}
			{editProfile ? ' edit-open' : ''}
			{yamlOpen ? ' yaml-open' : ''}
			{importOpen ? ' import-open' : ''}
			<button type="button" onClick={closeCreateModal}>
				Close create modal
			</button>
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

function LocationProbe() {
	const location = useLocation()
	return <div data-testid="location-search">{location.search || '(empty)'}</div>
}

function mockProfilesPageBase() {
	const getMeta = vi.fn().mockResolvedValue({
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
	const profilesApi = {
		listProfiles: vi.fn().mockResolvedValue([
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
	] as never),
	}

	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({ getMeta } as never)
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue(profilesApi as never)
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

	it('removes the create query parameter when the modal closes', async () => {
		render(
			<QueryClientProvider client={createClient()}>
				<MemoryRouter initialEntries={[{ pathname: '/profiles', search: '?create=1' }]}>
					<Routes>
						<Route
							path="/profiles"
							element={
								<>
									<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
									<LocationProbe />
								</>
							}
						/>
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByTestId('location-search')).toHaveTextContent('?create=1')
		expect(await screen.findByTestId('profiles-modals')).toHaveTextContent('create-open')

		fireEvent.click(screen.getByRole('button', { name: 'Close create modal' }))

		await waitFor(() => expect(screen.queryByTestId('profiles-modals')).not.toBeInTheDocument())
		expect(screen.getByTestId('location-search')).toHaveTextContent('(empty)')
	})
})
