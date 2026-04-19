import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { profileScopedStorageKey } from '../../../lib/profileScopedStorage'
import { createMockApiClient } from '../../../test/mockApiClient'
import { transfersStub } from '../../../test/transfersStub'
import { useUploadsPageState } from '../useUploadsPageState'

const {
	apiClientRef,
	transfersRef,
	isOfflineRef,
	directorySupportRef,
	promptForFilesMock,
	promptForFolderFilesMock,
	messageErrorMock,
	messageInfoMock,
	messageWarningMock,
} = vi.hoisted(() => ({
	apiClientRef: { current: null as unknown },
	transfersRef: { current: null as unknown },
	isOfflineRef: { current: false },
	directorySupportRef: { current: { ok: true, mode: 'picker' as const } },
	promptForFilesMock: vi.fn(),
	promptForFolderFilesMock: vi.fn(),
	messageErrorMock: vi.fn(),
	messageInfoMock: vi.fn(),
	messageWarningMock: vi.fn(),
}))

function createTransfersValue(overrides: Partial<typeof transfersStub> = {}) {
	return { ...transfersStub, ...overrides }
}

transfersRef.current = createTransfersValue()

vi.mock('../../../api/useAPIClient', () => ({
	useAPIClient: () => apiClientRef.current,
}))

vi.mock('../../../components/useTransfers', () => ({
	useTransfers: () => transfersRef.current,
}))

vi.mock('../../../lib/useIsOffline', () => ({
	useIsOffline: () => isOfflineRef.current,
}))

vi.mock('../../../lib/deviceFs', () => ({
	getDirectorySelectionSupport: () => directorySupportRef.current,
}))

vi.mock('../../../components/transfers/transfersUploadUtils', () => ({
	promptForFiles: (...args: unknown[]) => promptForFilesMock(...args),
	promptForFolderFiles: (...args: unknown[]) => promptForFolderFilesMock(...args),
}))

vi.mock('antd', () => ({
	message: {
		error: (...args: unknown[]) => messageErrorMock(...args),
		info: (...args: unknown[]) => messageInfoMock(...args),
		warning: (...args: unknown[]) => messageWarningMock(...args),
	},
}))

function createQueryClient() {
	return new QueryClient({
		defaultOptions: {
			queries: { retry: false },
			mutations: { retry: false },
		},
	})
}

function createWrapper(queryClient: QueryClient) {
	return function Wrapper(props: PropsWithChildren) {
		return <QueryClientProvider client={queryClient}>{props.children}</QueryClientProvider>
	}
}

function buildMeta(overrides: Record<string, unknown> = {}) {
	return {
		version: 'test',
		serverAddr: '127.0.0.1:8080',
		dataDir: '/data',
		dbBackend: 'sqlite',
		staticDir: '/app/ui',
		apiTokenEnabled: true,
		encryptionEnabled: false,
		capabilities: {
			profileTls: { enabled: false, reason: 'disabled' },
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
		...overrides,
	}
}

function buildProfile(overrides: Record<string, unknown> = {}) {
	return {
		id: 'profile-1',
		name: 'Primary Profile',
		provider: 's3_compatible',
		endpoint: 'http://127.0.0.1:9000',
		region: 'us-east-1',
		forcePathStyle: false,
		preserveLeadingSlash: false,
		tlsInsecureSkipVerify: false,
		createdAt: '2026-04-08T00:00:00Z',
		updatedAt: '2026-04-08T00:00:00Z',
		...overrides,
	}
}

function setupApi(args?: {
	profiles?: ReturnType<typeof buildProfile>[]
	buckets?: Array<{ name: string; createdAt: string }>
}) {
	apiClientRef.current = createMockApiClient({
		server: {
			getMeta: vi.fn().mockResolvedValue(buildMeta()),
		},
		profiles: {
			listProfiles: vi.fn().mockResolvedValue(args?.profiles ?? [buildProfile()]),
		},
		buckets: {
			listBuckets: vi.fn().mockResolvedValue(
				args?.buckets ?? [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
			),
		},
	})
}

afterEach(() => {
	window.localStorage.clear()
	apiClientRef.current = null
	transfersRef.current = createTransfersValue()
	isOfflineRef.current = false
	directorySupportRef.current = { ok: true, mode: 'picker' }
	promptForFilesMock.mockReset()
	promptForFolderFilesMock.mockReset()
	messageErrorMock.mockReset()
	messageInfoMock.mockReset()
	messageWarningMock.mockReset()
	vi.restoreAllMocks()
})

describe('useUploadsPageState', () => {
	it('reads bucket and prefix from the active profile scope and switches on profile change', async () => {
		setupApi({
			profiles: [
				buildProfile({ id: 'profile-1', name: 'Alpha Profile' }),
				buildProfile({ id: 'profile-2', name: 'Beta Profile' }),
			],
		})
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-1', 'bucket'),
			JSON.stringify('alpha-bucket'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-1', 'prefix'),
			JSON.stringify('alpha/'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-2', 'bucket'),
			JSON.stringify('beta-bucket'),
		)
		window.localStorage.setItem(
			profileScopedStorageKey('uploads', 'token-a', 'profile-2', 'prefix'),
			JSON.stringify('beta/'),
		)

		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null }) => useUploadsPageState(props),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' },
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.bucket).toBe('alpha-bucket'))
		expect(result.current.prefix).toBe('alpha/')

		rerender({ apiToken: 'token-a', profileId: 'profile-2' })

		await waitFor(() => expect(result.current.bucket).toBe('beta-bucket'))
		expect(result.current.prefix).toBe('beta/')
	})

	it('queues the selected folder payload and clears staged selection afterwards', async () => {
		const queueUploadFiles = vi.fn()
		const fileA = new File(['alpha'], 'a.txt', { type: 'text/plain' })
		const fileB = new File(['beta'], 'b.txt', { type: 'text/plain' })
		promptForFolderFilesMock.mockResolvedValue({
			files: [fileA, fileB],
			label: 'photos',
			mode: 'picker',
		})
		transfersRef.current = createTransfersValue({ queueUploadFiles })
		setupApi()

		const { result } = renderHook(
			() =>
				useUploadsPageState({
					apiToken: 'token-a',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.bucketsQuery.isSuccess).toBe(true))

		act(() => {
			result.current.setBucket('primary-bucket')
			result.current.setPrefix('photos/2024')
		})

		await act(async () => {
			await result.current.chooseUploadFolder()
		})

		await waitFor(() => expect(result.current.selectedFileCount).toBe(2))

		act(() => {
			result.current.queueUpload()
		})

		expect(queueUploadFiles).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'primary-bucket',
			prefix: 'photos/2024',
			files: [fileA, fileB],
			label: 'photos',
			directorySelectionMode: 'picker',
		})
		expect(result.current.selectedFiles).toEqual([])
		expect(messageWarningMock).not.toHaveBeenCalled()
		expect(messageErrorMock).not.toHaveBeenCalled()
	})

	it('keeps the upload picker closed and warns when offline', async () => {
		isOfflineRef.current = true
		setupApi()

		const { result } = renderHook(
			() =>
				useUploadsPageState({
					apiToken: 'token-a',
					profileId: 'profile-1',
				}),
			{
				wrapper: createWrapper(createQueryClient()),
			},
		)

		await waitFor(() => expect(result.current.selectedProfile?.id).toBe('profile-1'))

		act(() => {
			result.current.openUploadPicker()
		})

		expect(result.current.uploadSourceOpen).toBe(false)
		expect(messageWarningMock).toHaveBeenCalledWith('Offline: uploads are disabled.')
		expect(messageInfoMock).not.toHaveBeenCalled()
	})
})
