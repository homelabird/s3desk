import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

vi.mock('../../api/useAPIClient', async () => {
	const { APIClient } = await import('../../api/client')
	return {
		useAPIClient: () => new APIClient({ apiToken: 'test-token' }),
	}
})

vi.mock('../profiles/profileYaml', async () => {
	const actual = await vi.importActual<typeof import('../profiles/profileYaml')>('../profiles/profileYaml')
	return {
		...actual,
		parseProfileYaml: vi.fn(async (yamlText: string) => ({
			request: {
				provider: 's3_compatible',
				name: yamlText.trim() || 'Updated Profile',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				accessKeyId: 'demo-access',
				secretAccessKey: 'demo-secret',
				sessionToken: null,
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
			},
			updateRequest: {
				name: yamlText.trim() || 'Updated Profile',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				accessKeyId: 'demo-access',
				secretAccessKey: 'demo-secret',
				sessionToken: null,
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
			},
			tlsConfig: undefined,
			hasTLSBlock: false,
		})),
	}
})

vi.mock('../profiles/ProfilesTable', () => ({
	ProfilesTable: ({
		rows,
		onOpenYaml,
	}: {
		rows: Array<{ profile: { id: string; name: string } }>
		onOpenYaml: (profile: { id: string; name: string }) => void
	}) => (
		<div>
			{rows.map((row) => (
				<button key={row.profile.id} type="button" onClick={() => onOpenYaml(row.profile)}>
					Open YAML {row.profile.name}
				</button>
			))}
		</div>
	),
}))

vi.mock('../profiles/profilesLazy', () => ({
	ProfilesModals: ({
		yamlOpen,
		yamlProfile,
		yamlDraft,
		onYamlDraftChange,
		onYamlSave,
		closeYamlModal,
	}: {
		yamlOpen: boolean
		yamlProfile: { name: string } | null
		yamlDraft: string
		onYamlDraftChange: (value: string) => void
		onYamlSave: () => void
		closeYamlModal: () => void
	}) =>
		yamlOpen ? (
			<div role="dialog" aria-label="Profile YAML">
				<div data-testid="yaml-profile">{yamlProfile?.name ?? ''}</div>
				<textarea
					aria-label="YAML Draft"
					value={yamlDraft}
					onChange={(event) => onYamlDraftChange(event.target.value)}
				/>
				<button type="button" onClick={onYamlSave}>
					Save YAML
				</button>
				<button type="button" onClick={closeYamlModal}>
					Close YAML
				</button>
			</div>
		) : null,
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

function createClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
}

beforeAll(() => {
	ensureDomShims()
})

afterEach(() => {
	vi.restoreAllMocks()
})

describe('ProfilesPage YAML flow', () => {
	it('closes the YAML modal and ignores stale export responses after the api token changes', async () => {
		const client = createClient()
		const exportRequest = deferred<string>()

		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: vi.fn().mockResolvedValue({
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
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: '1.52.0',
					path: '/usr/bin/rclone',
					version: 'v1.66.0',
				},
			} as never),
		} as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
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
			exportProfileYaml: vi.fn(() => exportRequest.promise),
			updateProfile: vi.fn(),
			updateProfileTLS: vi.fn(),
			deleteProfileTLS: vi.fn(),
			createProfile: vi.fn(),
			deleteProfile: vi.fn(),
			testProfile: vi.fn(),
			benchmarkProfile: vi.fn(),
		} as never)

		const { rerender } = render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-1" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(await screen.findByRole('button', { name: 'Open YAML Primary Profile' }))
		expect(await screen.findByRole('dialog', { name: 'Profile YAML' })).toBeInTheDocument()

		rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-2" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Profile YAML' })).not.toBeInTheDocument()
		})

		await act(async () => {
			exportRequest.resolve('name: stale-export\n')
			await Promise.resolve()
		})

		expect(screen.queryByRole('dialog', { name: 'Profile YAML' })).not.toBeInTheDocument()
		expect(screen.queryByDisplayValue('name: stale-export\n')).not.toBeInTheDocument()
	})

	it('ignores stale YAML export responses when switching profiles', async () => {
		const primaryExport = deferred<string>()
		const secondaryExport = deferred<string>()

		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: vi.fn().mockResolvedValue({
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
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: '1.52.0',
					path: '/usr/bin/rclone',
					version: 'v1.66.0',
				},
			} as never),
		} as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
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
				{
					id: 'profile-2',
					name: 'Secondary Profile',
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
			exportProfileYaml: vi.fn((profileId: string) =>
				profileId === 'profile-1' ? primaryExport.promise : secondaryExport.promise,
			),
			updateProfile: vi.fn(),
			updateProfileTLS: vi.fn(),
			deleteProfileTLS: vi.fn(),
			createProfile: vi.fn(),
			deleteProfile: vi.fn(),
			testProfile: vi.fn(),
			benchmarkProfile: vi.fn(),
		} as never)

		render(
			<QueryClientProvider client={createClient()}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(await screen.findByRole('button', { name: 'Open YAML Primary Profile' }))
		expect(await screen.findByRole('dialog', { name: 'Profile YAML' })).toBeInTheDocument()
		expect(screen.getByTestId('yaml-profile')).toHaveTextContent('Primary Profile')

		fireEvent.click(screen.getByRole('button', { name: 'Open YAML Secondary Profile' }))
		expect(screen.getByTestId('yaml-profile')).toHaveTextContent('Secondary Profile')

		await act(async () => {
			primaryExport.resolve('name: stale-primary\n')
			await Promise.resolve()
		})

		expect(screen.getByRole('textbox', { name: 'YAML Draft' })).toHaveValue('')

		await act(async () => {
			secondaryExport.resolve('name: secondary\n')
			await Promise.resolve()
		})

		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: 'YAML Draft' })).toHaveValue('name: secondary\n')
		})
	})

	it('invalidates scoped profile queries after saving YAML', async () => {
		const client = createClient()
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
		const updateProfile = vi.fn().mockResolvedValue({
			id: 'profile-1',
			name: 'Saved Profile',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: false,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-02T00:00:00Z',
		})
		const exportProfileYaml = vi
			.fn()
			.mockResolvedValueOnce('name: original\n')
			.mockResolvedValueOnce('name: saved\n')

		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: vi.fn().mockResolvedValue({
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
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: '1.52.0',
					path: '/usr/bin/rclone',
					version: 'v1.66.0',
				},
			} as never),
		} as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
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
			exportProfileYaml,
			updateProfile,
			updateProfileTLS: vi.fn(),
			deleteProfileTLS: vi.fn(),
			createProfile: vi.fn(),
			deleteProfile: vi.fn(),
			testProfile: vi.fn(),
			benchmarkProfile: vi.fn(),
		} as never)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(await screen.findByRole('button', { name: 'Open YAML Primary Profile' }))
		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: 'YAML Draft' })).toHaveValue('name: original\n')
		})

		fireEvent.change(screen.getByRole('textbox', { name: 'YAML Draft' }), {
			target: { value: 'name: saved\n' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save YAML' }))

		await waitFor(() => {
			expect(updateProfile).toHaveBeenCalledTimes(1)
		})
		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles', 'list', 'token'], exact: true })
		})
		expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles', 'tls', 'profile-1', 'token'], exact: true })
	})

	it('ignores stale YAML save responses after the api token changes', async () => {
		const client = createClient()
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
		const updateProfileRequest = deferred<{
			id: string
			name: string
			provider: string
			endpoint: string
			region: string
			forcePathStyle: boolean
			preserveLeadingSlash: boolean
			tlsInsecureSkipVerify: boolean
			createdAt: string
			updatedAt: string
		}>()
		const updateProfile = vi.fn().mockImplementation(() => updateProfileRequest.promise)
		const exportProfileYaml = vi
			.fn()
			.mockResolvedValueOnce('name: original\n')
			.mockResolvedValueOnce('name: saved\n')

		vi.spyOn(APIClient.prototype, 'server', 'get').mockReturnValue({
			getMeta: vi.fn().mockResolvedValue({
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
				transferEngine: {
					name: 'rclone',
					available: true,
					compatible: true,
					minVersion: '1.52.0',
					path: '/usr/bin/rclone',
					version: 'v1.66.0',
				},
			} as never),
		} as never)
		vi.spyOn(APIClient.prototype, 'profiles', 'get').mockReturnValue({
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
			exportProfileYaml,
			updateProfile,
			updateProfileTLS: vi.fn(),
			deleteProfileTLS: vi.fn(),
			createProfile: vi.fn(),
			deleteProfile: vi.fn(),
			testProfile: vi.fn(),
			benchmarkProfile: vi.fn(),
		} as never)

		const setProfileId = vi.fn()
		const { rerender } = render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-1" profileId={null} setProfileId={setProfileId} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(await screen.findByRole('button', { name: 'Open YAML Primary Profile' }))
		await waitFor(() => {
			expect(screen.getByRole('textbox', { name: 'YAML Draft' })).toHaveValue('name: original\n')
		})

		fireEvent.change(screen.getByRole('textbox', { name: 'YAML Draft' }), {
			target: { value: 'name: saved\n' },
		})
		fireEvent.click(screen.getByRole('button', { name: 'Save YAML' }))

		await waitFor(() => {
			expect(updateProfile).toHaveBeenCalledTimes(1)
		})

		rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-2" profileId={null} setProfileId={setProfileId} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Profile YAML' })).not.toBeInTheDocument()
		})

		await act(async () => {
			updateProfileRequest.resolve({
				id: 'profile-1',
				name: 'Saved Profile',
				provider: 's3_compatible',
				endpoint: 'http://127.0.0.1:9000',
				region: 'us-east-1',
				forcePathStyle: false,
				preserveLeadingSlash: false,
				tlsInsecureSkipVerify: false,
				createdAt: '2024-01-01T00:00:00Z',
				updatedAt: '2024-01-02T00:00:00Z',
			})
			await Promise.resolve()
		})

		expect(screen.queryByRole('dialog', { name: 'Profile YAML' })).not.toBeInTheDocument()
		expect(invalidateSpy).not.toHaveBeenCalled()
	})
})
