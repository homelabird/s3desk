import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient, APIError } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

beforeAll(() => {
	ensureDomShims()
})

const originalMatchMedia = window.matchMedia

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

afterEach(() => {
	window.matchMedia = originalMatchMedia
	vi.restoreAllMocks()
})

describe('ProfilesPage', () => {
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

	async function openPrimaryProfileAction(actionLabel: 'Test' | 'Benchmark') {
		const moreButtons = await screen.findAllByRole('button', { name: 'More actions for Primary Profile' })
		await act(async () => {
			fireEvent.click(moreButtons[0]!)
		})
		await act(async () => {
			fireEvent.click(await screen.findByText(actionLabel))
		})
	}

	it('dismisses onboarding callout', () => {
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

		expect(screen.getByText('Getting started')).toBeInTheDocument()
		fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
		expect(screen.queryByText('Getting started')).not.toBeInTheDocument()
	}, 20_000)

	it('surfaces legacy profiles that need updates', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

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
		] as never)

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
		expect(await screen.findByText('Edit Profile')).toBeInTheDocument()
	})

	it('shows troubleshooting hint for failed profile tests', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockProfilesPageBase()
		const testProfileSpy = vi.spyOn(APIClient.prototype, 'testProfile').mockResolvedValue({
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

		mockProfilesPageBase()
		const testProfileSpy = vi.spyOn(APIClient.prototype, 'testProfile').mockRejectedValue(
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

		expect(await screen.findByTestId('profiles-table-desktop')).toBeInTheDocument()
		expect(screen.queryByTestId('profiles-list-compact')).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: /^Use$/ })).toBeInTheDocument()
	})

	it('shows troubleshooting hint for failed benchmark results', async () => {
		const client = new QueryClient({
			defaultOptions: {
				queries: { retry: false },
			},
		})

		mockProfilesPageBase()
		const benchmarkProfileSpy = vi.spyOn(APIClient.prototype, 'benchmarkProfile').mockResolvedValue({
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

		mockProfilesPageBase()
		const benchmarkProfileSpy = vi.spyOn(APIClient.prototype, 'benchmarkProfile').mockRejectedValue(
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

		mockProfilesPageBase()
		const benchmarkProfileSpy = vi.spyOn(APIClient.prototype, 'benchmarkProfile').mockResolvedValue({
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
})
