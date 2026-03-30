import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { message } from 'antd'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient, APIError } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'
import type { ProfileFormValues } from '../profiles/profileTypes'

vi.mock('../profiles/profilesLazy', async () => {
	const React = await import('react')

	function MockProfileDialog(props: {
		title: string
		submitLabel?: string
		onClose: () => void
		onSubmit?: (values: ProfileFormValues) => void
	}) {
		const [name, setName] = React.useState('')
		const [accessKeyId, setAccessKeyId] = React.useState('')
		const [secretAccessKey, setSecretAccessKey] = React.useState('')

		return (
			<div role="dialog" aria-label={props.title}>
				<h2>{props.title}</h2>
				<label>
					Name
					<input aria-label="Name" value={name} onChange={(event) => setName(event.target.value)} />
				</label>
				<label>
					Access Key ID
					<input aria-label="Access Key ID" value={accessKeyId} onChange={(event) => setAccessKeyId(event.target.value)} />
				</label>
				<label>
					Secret
					<input aria-label="Secret" value={secretAccessKey} onChange={(event) => setSecretAccessKey(event.target.value)} />
				</label>
				<button type="button" aria-label="Close" onClick={props.onClose}>
					Close
				</button>
				{props.onSubmit ? (
					<button
						type="button"
						onClick={() =>
							props.onSubmit?.(
								{
									provider: 's3_compatible',
									name,
									endpoint: 'http://127.0.0.1:9000',
									publicEndpoint: '',
									region: 'us-east-1',
									accessKeyId,
									secretAccessKey,
									sessionToken: '',
									forcePathStyle: false,
									preserveLeadingSlash: false,
									tlsInsecureSkipVerify: false,
									tlsEnabled: false,
									tlsAction: 'keep',
								} as ProfileFormValues,
							)
						}
					>
						{props.submitLabel}
					</button>
				) : null}
			</div>
		)
	}

	type MockProfilesModalsProps = {
		createOpen: boolean
		closeCreateModal: () => void
		onCreateSubmit: (values: ProfileFormValues) => void
		editProfile: { id: string } | null
		closeEditModal: () => void
	}

	return {
		ProfilesModals: (props: MockProfilesModalsProps) => (
			<>
				{props.createOpen ? (
					<MockProfileDialog title="Create Profile" submitLabel="Create" onClose={props.closeCreateModal} onSubmit={props.onCreateSubmit} />
				) : null}
				{props.editProfile ? <MockProfileDialog title="Edit Profile" onClose={props.closeEditModal} /> : null}
			</>
		),
	}
})

beforeAll(() => {
	ensureDomShims()
})

const SLOW_PROFILES_TIMEOUT_MS = 20_000

const originalMatchMedia = window.matchMedia
const defaultMeta = {
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
}
const defaultProfiles = [
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
]

function deferred<T>() {
	let resolve!: (value: T | PromiseLike<T>) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function mockServerApi(meta = defaultMeta) {
	const serverApi = {
		getMeta: vi.fn().mockResolvedValue(meta as never),
	}
	vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue(serverApi as never)
	return serverApi
}

function mockProfilesApi(
	overrides: Partial<{
		listProfiles: ReturnType<typeof vi.fn>
		testProfile: ReturnType<typeof vi.fn>
		createProfile: ReturnType<typeof vi.fn>
		getProfileTLS: ReturnType<typeof vi.fn>
		benchmarkProfile: ReturnType<typeof vi.fn>
	}> = {},
) {
	const profilesApi = {
		listProfiles: vi.fn().mockResolvedValue(defaultProfiles as never),
		testProfile: vi.fn(),
		createProfile: vi.fn(),
		getProfileTLS: vi.fn().mockResolvedValue(null as never),
		benchmarkProfile: vi.fn(),
		...overrides,
	}
	vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue(profilesApi as never)
	return profilesApi
}

function mockViewportWidth(width: number) {
	window.matchMedia = vi.fn().mockImplementation((query: string): MediaQueryList => {
		const minMatch = query.match(/\(min-width:\s*(\d+)px\)/)
		const maxMatch = query.match(/\(max-width:\s*(\d+)px\)/)
		let matches = true
		if (minMatch) matches &&= width >= Number(minMatch[1])
		if (maxMatch) matches &&= width <= Number(maxMatch[1])
		return {
			matches,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}
	})
}

afterEach(async () => {
	await act(async () => {
		message.destroy()
	})
	window.matchMedia = originalMatchMedia
	vi.restoreAllMocks()
})

describe('ProfilesPage', () => {
	function SearchProbe() {
		const location = useLocation()
		return <div data-testid="profiles-search">{location.search}</div>
	}

	function mockProfilesPageBase() {
		mockServerApi()
		return mockProfilesApi()
	}

	async function openPrimaryProfileAction(actionLabel: 'Test' | 'Benchmark') {
		await screen.findByText('Primary Profile', undefined, { timeout: 5_000 })
		const moreButtons = await screen.findAllByRole(
			'button',
			{ name: 'More actions for Primary Profile' },
			{ timeout: 5_000 },
		)
		await act(async () => {
			fireEvent.click(moreButtons[0]!)
		})
		await act(async () => {
			fireEvent.click(await screen.findByText(actionLabel, undefined, { timeout: 5_000 }))
		})
	}

	it('dismisses onboarding callout', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})
		mockProfilesPageBase()
		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(screen.getByText('Getting started')).toBeInTheDocument()
		await screen.findByText('Primary Profile', undefined, { timeout: 5_000 })
		await act(async () => {
			fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
		})
		await waitFor(() => expect(screen.queryByText('Getting started')).not.toBeInTheDocument())
	}, 20_000)

	it('surfaces legacy profiles that need updates', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockServerApi()
		mockProfilesApi({
			listProfiles: vi.fn().mockResolvedValue([
				{
				id: 'legacy-gcs',
				name: 'Legacy GCS',
				provider: 'gcp_gcs',
				anonymous: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
				validation: {
					valid: false,
					issues: [
						{
							code: 'gcp_project_number_required',
							field: 'projectNumber',
							message: 'This GCS profile predates the required Project Number field. Edit the profile and add Project Number to restore bucket management.',
						},
					],
				},
				effectiveCapabilities: {
					bucketCrud: false,
					objectCrud: true,
					jobTransfer: true,
					bucketPolicy: false,
					gcsIamPolicy: true,
					azureContainerAccessPolicy: false,
					presignedUpload: false,
					presignedMultipartUpload: false,
					directUpload: false,
					reasons: {
						bucketCrud: 'GCS bucket operations require Project Number on this profile.',
					},
				},
				},
			] as never),
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByText('Profiles need updates (1)')).toBeInTheDocument()
		expect(screen.getAllByText('Legacy GCS').length).toBeGreaterThan(0)
		expect(screen.getAllByText('Needs update').length).toBeGreaterThan(0)
		fireEvent.click(screen.getByRole('button', { name: 'Edit profile Legacy GCS' }))
		expect(await screen.findByText('Edit Profile', undefined, { timeout: 10_000 })).toBeInTheDocument()
	}, 20_000)

	it('shows troubleshooting hint for failed profile tests', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const profilesApi = mockProfilesPageBase()
		const testProfileSpy = profilesApi.testProfile.mockResolvedValue({
			ok: false,
			message: 'failed',
			details: {
				error: 'AccessDenied',
				normalizedError: { code: 'access_denied', retryable: false },
			},
		} as never)
		const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Test')
		await waitFor(() => expect(testProfileSpy).toHaveBeenCalledWith('profile-1'))

		await waitFor(() => {
			expect(warningSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'failed (error: AccessDenied, code: access_denied) · The credentials are valid but lack permission. Check IAM policies or bucket permissions.',
				),
				8,
			)
		})
	})

	it('shows profile test unavailable error for API test failures', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const profilesApi = mockProfilesPageBase()
		const testProfileSpy = profilesApi.testProfile.mockRejectedValue(
			new APIError({
				status: 400,
				code: 'transfer_engine_incompatible',
				message: 'rclone version is incompatible',
				details: { currentVersion: 'rclone v1.51.0', minVersion: '1.52.0' },
			}),
		)
		const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Test')
		await waitFor(() => expect(testProfileSpy).toHaveBeenCalledWith('profile-1'))

		await waitFor(() => {
			expect(errorSpy).toHaveBeenCalledWith(
				'Profile test unavailable: transfer_engine_incompatible: rclone version is incompatible · Recommended action: Transfer engine (rclone) version is incompatible (current: rclone v1.51.0 · requires: >= 1.52.0). Upgrade rclone on the server.',
				8,
			)
		})
	})

	it('opens the create modal from the route query and clears the query when closed', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockServerApi()
		mockProfilesApi({
			listProfiles: vi.fn().mockResolvedValue([] as never),
		})

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/profiles?create=1']}>
					<Routes>
						<Route
							path="/profiles"
							element={
								<>
									<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
									<SearchProbe />
								</>
							}
						/>
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		const dialog = await screen.findByRole('dialog', { name: 'Create Profile' })
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }))
		})

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Profile' })).not.toBeInTheDocument())
		expect(screen.getByTestId('profiles-search')).toHaveTextContent('')
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('clears the create query after a successful create flow', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		mockServerApi()
		const profilesApi = mockProfilesApi({
			listProfiles: vi.fn().mockResolvedValue([] as never),
		})
		profilesApi.createProfile.mockResolvedValue({
			id: 'profile-2',
			name: 'Created Profile',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: false,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		} as never)
		vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/profiles?create=1']}>
					<Routes>
						<Route
							path="/profiles"
							element={
								<>
									<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
									<SearchProbe />
								</>
							}
						/>
					</Routes>
				</MemoryRouter>
			</QueryClientProvider>,
		)

		const dialog = await screen.findByRole('dialog', { name: 'Create Profile' })
		fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
			target: { value: 'Created Profile' },
		})
		fireEvent.change(within(dialog).getByRole('textbox', { name: 'Access Key ID' }), {
			target: { value: 'demo-access' },
		})
		fireEvent.change(within(dialog).getByLabelText('Secret'), {
			target: { value: 'demo-secret' },
		})
		await act(async () => {
			fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }))
		})

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Profile' })).not.toBeInTheDocument())
		await waitFor(() => expect(screen.getByTestId('profiles-search')).toHaveTextContent(''))
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('keeps the current create modal open when an older create request resolves', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		mockServerApi()
		const createProfileRequest = deferred<(typeof defaultProfiles)[number]>()
		const profilesApi = mockProfilesApi({
			listProfiles: vi.fn().mockResolvedValue([] as never),
			createProfile: vi.fn().mockReturnValue(createProfileRequest.promise),
		})
		const setProfileId = vi.fn()
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/profiles?create=1']}>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={setProfileId} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		const firstDialog = await screen.findByRole('dialog', { name: 'Create Profile' })
		fireEvent.change(within(firstDialog).getByRole('textbox', { name: 'Name' }), {
			target: { value: 'Created Profile' },
		})
		fireEvent.change(within(firstDialog).getByRole('textbox', { name: 'Access Key ID' }), {
			target: { value: 'demo-access' },
		})
		fireEvent.change(within(firstDialog).getByLabelText('Secret'), {
			target: { value: 'demo-secret' },
		})

		await act(async () => {
			fireEvent.click(within(firstDialog).getByRole('button', { name: 'Create' }))
		})

		await waitFor(() => expect(profilesApi.createProfile).toHaveBeenCalledTimes(1))

		await act(async () => {
			fireEvent.click(within(firstDialog).getByRole('button', { name: 'Close' }))
		})
		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Profile' })).not.toBeInTheDocument())

		await act(async () => {
			fireEvent.click(screen.getAllByRole('button', { name: 'New Profile' })[0]!)
		})

		const reopenedDialog = await screen.findByRole('dialog', { name: 'Create Profile' })

		await act(async () => {
			createProfileRequest.resolve({
				id: 'profile-created-stale',
				name: 'Created Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-01T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(reopenedDialog).toBeInTheDocument()
		expect(setProfileId).not.toHaveBeenCalled()
		expect(successSpy).not.toHaveBeenCalled()
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('closes the create modal and clears stale draft after the api token changes', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		mockProfilesPageBase()

		const view = render(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/profiles?create=1']}>
					<ProfilesPage apiToken="token-a" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		const dialog = await screen.findByRole('dialog', { name: 'Create Profile' })
		fireEvent.change(within(dialog).getByRole('textbox', { name: 'Name' }), {
			target: { value: 'Created Profile' },
		})
		fireEvent.change(within(dialog).getByRole('textbox', { name: 'Access Key ID' }), {
			target: { value: 'demo-access' },
		})
		fireEvent.change(within(dialog).getByLabelText('Secret'), {
			target: { value: 'demo-secret' },
		})

		view.rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter initialEntries={['/profiles?create=1']}>
					<ProfilesPage apiToken="token-b" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create Profile' })).not.toBeInTheDocument())

		await act(async () => {
			fireEvent.click(screen.getAllByRole('button', { name: 'New Profile' })[0]!)
		})

		const reopenedDialog = await screen.findByRole('dialog', { name: 'Create Profile' })
		expect(within(reopenedDialog).getByRole('textbox', { name: 'Name' })).toHaveValue('')
		expect(within(reopenedDialog).getByRole('textbox', { name: 'Access Key ID' })).toHaveValue('')
		expect(within(reopenedDialog).getByLabelText('Secret')).toHaveValue('')
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('renders compact profile cards on tablet widths', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockViewportWidth(820)
		mockProfilesPageBase()

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByTestId('profiles-list-compact')).toBeInTheDocument()
		expect(screen.queryByTestId('profiles-table-desktop')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Use profile' })).toBeInTheDocument()
	})

	it('renders the full table on desktop widths', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockViewportWidth(1200)
		mockProfilesPageBase()

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		expect(await screen.findByTestId('profiles-table-desktop', undefined, { timeout: 5_000 })).toBeInTheDocument()
		expect(screen.queryByTestId('profiles-list-compact')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: /^Use$/ })).toBeInTheDocument()
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('shows troubleshooting hint for failed benchmark results', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const profilesApi = mockProfilesPageBase()
		const benchmarkProfileSpy = profilesApi.benchmarkProfile.mockResolvedValue({
			ok: false,
			message: 'failed to list buckets: AccessDenied',
			cleanedUp: false,
			details: {
				error: 'AccessDenied',
				normalizedError: { code: 'access_denied', retryable: false },
			},
		} as never)
		const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Benchmark')
		await waitFor(() => expect(benchmarkProfileSpy).toHaveBeenCalledWith('profile-1'))

		await waitFor(() => {
			expect(warningSpy).toHaveBeenCalledWith(
				expect.stringContaining(
					'failed to list buckets: AccessDenied (error: AccessDenied, code: access_denied) · The credentials are valid but lack permission. Check IAM policies or bucket permissions.',
				),
				8,
			)
		})
	})

	it('shows benchmark unavailable error for API benchmark failures', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const profilesApi = mockProfilesPageBase()
		const benchmarkProfileSpy = profilesApi.benchmarkProfile.mockRejectedValue(
			new APIError({
				status: 400,
				code: 'transfer_engine_missing',
				message: 'rclone is required to run benchmarks (install it or set RCLONE_PATH)',
			}),
		)
		const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Benchmark')
		await waitFor(() => expect(benchmarkProfileSpy).toHaveBeenCalledWith('profile-1'))

		await waitFor(() => {
			expect(errorSpy).toHaveBeenCalledWith(
				'Benchmark unavailable: transfer_engine_missing: rclone is required to run benchmarks (install it or set RCLONE_PATH) · Recommended action: Transfer engine (rclone) not found. Install rclone or set RCLONE_PATH on the server.',
				8,
			)
		})
	})

	it('shows formatted success message for benchmark results', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		const profilesApi = mockProfilesPageBase()
		const benchmarkProfileSpy = profilesApi.benchmarkProfile.mockResolvedValue({
			ok: true,
			message: 'ok',
			cleanedUp: true,
			uploadBps: 1_000_000,
			downloadBps: 2_000_000,
			uploadMs: 150,
			downloadMs: 80,
		} as never)
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Benchmark')
		await waitFor(() => expect(benchmarkProfileSpy).toHaveBeenCalledWith('profile-1'))

		await waitFor(() => {
			expect(successSpy).toHaveBeenCalledWith('Benchmark OK: ↑ 1.0 Mbps · ↓ 2.0 Mbps · upload 150ms · download 80ms', 8)
		})
	})

	it('ignores stale benchmark responses after the api token changes', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
				mutations: { retry: false },
			},
		})

		const benchmarkRequest = deferred<{
			ok: boolean
			message: string
			cleanedUp: boolean
			uploadBps: number
			downloadBps: number
			uploadMs: number
			downloadMs: number
		}>()
		const profilesApi = mockProfilesPageBase()
		profilesApi.benchmarkProfile.mockReturnValue(benchmarkRequest.promise)
		const successSpy = vi.spyOn(message, 'success').mockImplementation(() => undefined as never)
		const warningSpy = vi.spyOn(message, 'warning').mockImplementation(() => undefined as never)
		const errorSpy = vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		const view = render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-a" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await openPrimaryProfileAction('Benchmark')
		await waitFor(() => expect(profilesApi.benchmarkProfile).toHaveBeenCalledWith('profile-1'))

		view.rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-b" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await act(async () => {
			benchmarkRequest.resolve({
				ok: true,
				message: 'ok',
				cleanedUp: true,
				uploadBps: 1_000_000,
				downloadBps: 2_000_000,
				uploadMs: 150,
				downloadMs: 80,
			})
			await Promise.resolve()
		})

		expect(successSpy).not.toHaveBeenCalled()
		expect(warningSpy).not.toHaveBeenCalled()
		expect(errorSpy).not.toHaveBeenCalled()
	}, SLOW_PROFILES_TIMEOUT_MS)

	it('closes the edit modal and ignores stale TLS queries after the api token changes', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockServerApi({
			...defaultMeta,
			capabilities: {
				...defaultMeta.capabilities,
				profileTls: { enabled: true, reason: '' },
			},
		})
		const getProfileTLSSpy = vi.fn().mockResolvedValue(null as never)
		mockProfilesApi({
			getProfileTLS: getProfileTLSSpy,
		})

		const view = render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-a" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(
			await screen.findByRole('button', { name: 'More actions for Primary Profile' }, { timeout: 5_000 }),
		)
		fireEvent.click(await screen.findByText('Edit', undefined, { timeout: 5_000 }))

		expect(await screen.findByRole('dialog', { name: 'Edit Profile' })).toBeInTheDocument()
		await waitFor(() => expect(getProfileTLSSpy).toHaveBeenCalledWith('profile-1'))

		view.rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-b" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Edit Profile' })).not.toBeInTheDocument()
		})
		expect(getProfileTLSSpy).toHaveBeenCalledTimes(1)
	}, SLOW_PROFILES_TIMEOUT_MS)

})
