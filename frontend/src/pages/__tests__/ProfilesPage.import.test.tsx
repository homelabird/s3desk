import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ChangeEventHandler } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import { APIClient } from '../../api/client'
import { ensureDomShims } from '../../test/domShims'
import { ProfilesPage } from '../ProfilesPage'

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		Input: {
			...actual.Input,
			TextArea: ({
				value,
				onChange,
				placeholder,
				disabled,
			}: {
				value?: string
				onChange?: ChangeEventHandler<HTMLTextAreaElement>
				placeholder?: string
				disabled?: boolean
			}) => (
				<textarea
					value={value ?? ''}
					onChange={onChange}
					placeholder={placeholder}
					disabled={disabled}
				/>
			),
		},
	}
})

vi.mock('../profiles/profileYaml', async () => {
	const actual = await vi.importActual<typeof import('../profiles/profileYaml')>('../profiles/profileYaml')
	return {
		...actual,
		parseProfileYaml: vi.fn(async (yamlText: string) => ({
			request: {
				provider: 's3_compatible',
				name: yamlText.trim() || 'Imported Profile',
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
				provider: 's3_compatible',
				name: yamlText.trim() || 'Imported Profile',
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

const fileReaderInstances: MockFileReader[] = []
const originalFileReader = globalThis.FileReader

class MockFileReader {
	result: string | ArrayBuffer | null = null
	onload: ((this: FileReader, ev: ProgressEvent<FileReader>) => unknown) | null = null
	readAsText = vi.fn()

	constructor() {
		fileReaderInstances.push(this)
	}
}

function mockProfilesPageBase(createProfile: ReturnType<typeof vi.fn>) {
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
		listProfiles: vi.fn().mockResolvedValue([] as never),
		createProfile,
		updateProfileTLS: vi.fn(),
		updateProfile: vi.fn(),
		deleteProfileTLS: vi.fn(),
		exportProfileYaml: vi.fn(),
		deleteProfile: vi.fn(),
		testProfile: vi.fn(),
		benchmarkProfile: vi.fn(),
	} as never)
}

beforeAll(() => {
	ensureDomShims()
})

beforeEach(() => {
	fileReaderInstances.length = 0
	globalThis.FileReader = MockFileReader as unknown as typeof FileReader
})

afterEach(() => {
	globalThis.FileReader = originalFileReader
	vi.restoreAllMocks()
})

describe('ProfilesPage import flow', () => {
	it('closes the import modal and ignores stale import success after the api token changes', async () => {
		const client = createClient()
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
		const createProfileRequest = deferred<{
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
		const createProfile = vi.fn().mockImplementation(() => createProfileRequest.promise)
		mockProfilesPageBase(createProfile)

		const { rerender } = render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-1" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const dialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Imported Profile' } })
		fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

		await waitFor(() => {
			expect(createProfile).toHaveBeenCalledTimes(1)
		})

		rerender(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token-2" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Import Profile YAML' })).not.toBeInTheDocument()
		})

		await act(async () => {
			createProfileRequest.resolve({
				id: 'profile-imported',
				name: 'Imported Profile',
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

		expect(screen.queryByRole('dialog', { name: 'Import Profile YAML' })).not.toBeInTheDocument()
		expect(invalidateSpy).not.toHaveBeenCalled()
	})

	it('ignores stale file-reader results after closing and reopening the import modal', async () => {
		mockProfilesPageBase(vi.fn())

		render(
			<QueryClientProvider client={createClient()}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const dialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		fireEvent.change(within(dialog).getByLabelText('Import profile YAML file'), {
			target: { files: [new File(['first'], 'first.yaml', { type: 'text/yaml' })] },
		})

		expect(fileReaderInstances).toHaveLength(1)

		fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Import Profile YAML' })).not.toBeInTheDocument()
		})

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const reopenedDialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		const textarea = within(reopenedDialog).getByRole('textbox')
		expect(textarea).toHaveValue('')

		await act(async () => {
			fileReaderInstances[0]!.result = 'name: stale-import\n'
			fileReaderInstances[0]!.onload?.call(
				fileReaderInstances[0] as unknown as FileReader,
				new ProgressEvent('load') as ProgressEvent<FileReader>,
			)
			await Promise.resolve()
		})

		expect(within(reopenedDialog).getByRole('textbox')).toHaveValue('')
	})

	it('ignores stale import failures after closing and reopening the import modal', async () => {
		const createProfileRequest = deferred<{
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
		const createProfile = vi.fn().mockImplementation(() => createProfileRequest.promise)
		mockProfilesPageBase(createProfile)

		render(
			<QueryClientProvider client={createClient()}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const dialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Pending Import' } })
		fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

		await waitFor(() => {
			expect(createProfile).toHaveBeenCalledTimes(1)
		})

		fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
		await waitFor(() => {
			expect(screen.queryByRole('dialog', { name: 'Import Profile YAML' })).not.toBeInTheDocument()
		})

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const reopenedDialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		expect(within(reopenedDialog).getByRole('textbox')).toHaveValue('')

		await act(async () => {
			createProfileRequest.reject(new Error('stale import failure'))
			await Promise.resolve()
		})

		expect(screen.queryByText('stale import failure')).not.toBeInTheDocument()
		expect(within(reopenedDialog).getByRole('textbox')).toHaveValue('')
	})

	it('invalidates the scoped profiles query after a successful import', async () => {
		const client = createClient()
		const invalidateSpy = vi.spyOn(client, 'invalidateQueries')
		const createProfile = vi.fn().mockResolvedValue({
			id: 'profile-imported',
			name: 'Imported Profile',
			provider: 's3_compatible',
			endpoint: 'http://127.0.0.1:9000',
			region: 'us-east-1',
			forcePathStyle: false,
			preserveLeadingSlash: false,
			tlsInsecureSkipVerify: false,
			createdAt: '2024-01-01T00:00:00Z',
			updatedAt: '2024-01-01T00:00:00Z',
		})
		mockProfilesPageBase(createProfile)

		render(
			<QueryClientProvider client={client}>
				<MemoryRouter>
					<ProfilesPage apiToken="token" profileId={null} setProfileId={vi.fn()} />
				</MemoryRouter>
			</QueryClientProvider>,
		)

		fireEvent.click(screen.getByRole('button', { name: 'Import YAML' }))
		const dialog = await screen.findByRole('dialog', { name: 'Import Profile YAML' })
		fireEvent.change(within(dialog).getByRole('textbox'), { target: { value: 'Imported Profile' } })
		fireEvent.click(within(dialog).getByRole('button', { name: 'Import' }))

		await waitFor(() => {
			expect(createProfile).toHaveBeenCalledTimes(1)
		})
		await waitFor(() => {
			expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['profiles', 'token'], exact: true })
		})
	})
})
