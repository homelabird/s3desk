import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverScopedStorageKey } from '../../../lib/profileScopedStorage'

const {
	apiClientRef,
	useTransfersDownloadQueueMock,
	useTransfersPersistenceMock,
	useTransfersTaskActionsMock,
	useTransfersUploadJobLifecycleMock,
	useTransfersUploadPreferencesMock,
	useTransfersUploadRuntimeMock,
	revokeObjectURLSafeMock,
} = vi.hoisted(() => ({
	apiClientRef: { current: {} as Record<string, unknown> },
	useTransfersDownloadQueueMock: vi.fn(),
	useTransfersPersistenceMock: vi.fn(),
	useTransfersTaskActionsMock: vi.fn(),
	useTransfersUploadJobLifecycleMock: vi.fn(),
	useTransfersUploadPreferencesMock: vi.fn(),
	useTransfersUploadRuntimeMock: vi.fn(),
	revokeObjectURLSafeMock: vi.fn(),
}))

vi.mock('../../../api/useAPIClient', () => ({
	useAPIClient: () => apiClientRef.current,
}))

vi.mock('../useTransfersDownloadQueue', () => ({
	useTransfersDownloadQueue: (args: unknown) => useTransfersDownloadQueueMock(args),
}))

vi.mock('../useTransfersPersistence', () => ({
	useTransfersPersistence: (args: unknown) => useTransfersPersistenceMock(args),
}))

vi.mock('../useTransfersTaskActions', () => ({
	useTransfersTaskActions: (args: unknown) => useTransfersTaskActionsMock(args),
}))

vi.mock('../useTransfersUploadJobLifecycle', () => ({
	useTransfersUploadJobLifecycle: (args: unknown) => useTransfersUploadJobLifecycleMock(args),
}))

vi.mock('../useTransfersUploadPreferences', () => ({
	useTransfersUploadPreferences: () => useTransfersUploadPreferencesMock(),
}))

vi.mock('../useTransfersUploadRuntime', () => ({
	useTransfersUploadRuntime: (args: unknown) => useTransfersUploadRuntimeMock(args),
}))

vi.mock('../uploadPreview', () => ({
	revokeObjectURLSafe: (url?: string | null) => revokeObjectURLSafeMock(url),
}))

import { useTransfersRuntimeController } from '../useTransfersRuntimeController'

function buildDownloadTask(
	overrides: Partial<{
		id: string
		status: 'queued' | 'waiting' | 'running' | 'succeeded' | 'failed' | 'canceled'
	}> = {},
) {
	return {
		id: 'download-1',
		kind: 'object' as const,
		profileId: 'profile-1',
		bucket: 'bucket-a',
		key: 'docs/report.pdf',
		label: 'report.pdf',
		status: 'running' as const,
		createdAtMs: 1,
		loadedBytes: 128,
		speedBps: 64,
		etaSeconds: 2,
		...overrides,
	}
}

function buildUploadTask(
	overrides: Partial<{
		id: string
		status: 'queued' | 'staging' | 'commit' | 'waiting_job' | 'succeeded' | 'failed' | 'canceled'
		previewUrl?: string
	}> = {},
) {
	const { previewUrl = undefined, ...rest } = overrides
	return {
		id: 'upload-1',
		profileId: 'profile-1',
		bucket: 'bucket-a',
		prefix: 'docs/',
		fileCount: 1,
		status: 'staging' as const,
		createdAtMs: 1,
		loadedBytes: 64,
		totalBytes: 128,
		speedBps: 32,
		etaSeconds: 2,
		label: 'report.pdf',
		...(previewUrl
			? {
					preview: {
						kind: 'video_frame' as const,
						source: 'local' as const,
						url: previewUrl,
						label: 'Preview',
						width: 240,
						height: 135,
					},
				}
			: {}),
		...rest,
	}
}

function createWrapper() {
	const queryClient = new QueryClient({
		defaultOptions: {
			queries: { retry: false },
		},
	})

	return ({ children }: PropsWithChildren) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useTransfersRuntimeController', () => {
	beforeEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
		apiClientRef.current = {}
		useTransfersUploadPreferencesMock.mockReturnValue({
			downloadLinkProxyEnabled: false,
			downloadTaskConcurrency: 5,
			uploadChunkFileConcurrency: 2,
			uploadTaskConcurrency: 3,
			uploadResumeConversionEnabled: false,
			pickUploadTuning: vi.fn(() => ({
				batchConcurrency: 8,
				batchBytes: 32 * 1024 * 1024,
				chunkSizeBytes: 64 * 1024 * 1024,
				chunkConcurrency: 4,
				chunkThresholdBytes: 128 * 1024 * 1024,
			})),
		})
		useTransfersDownloadQueueMock.mockReturnValue({
			queueDownloadObject: vi.fn(),
			queueDownloadObjectsToDevice: vi.fn(),
			queueDownloadJobArtifact: vi.fn(),
		})
		useTransfersUploadRuntimeMock.mockReturnValue({
			retryUploadTask: vi.fn(),
			queueUploadFiles: vi.fn(),
		})
		useTransfersTaskActionsMock.mockReturnValue({
			updateDownloadTask: vi.fn(),
			cancelDownloadTask: vi.fn(),
			retryDownloadTask: vi.fn(),
			removeDownloadTask: vi.fn(),
			clearCompletedDownloads: vi.fn(),
			updateUploadTask: vi.fn(),
			cancelUploadTask: vi.fn(),
			removeUploadTask: vi.fn(),
			clearCompletedUploads: vi.fn(),
			abortAllTransfers: vi.fn(),
			clearAllTransfers: vi.fn(),
		})
		useTransfersUploadJobLifecycleMock.mockReturnValue({
			handleUploadJobUpdate: vi.fn(async () => {}),
		})
	})

	afterEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
		vi.clearAllMocks()
	})

	it('passes configured task concurrency values into the transfer runtimes', () => {
		renderHook(
			() =>
				useTransfersRuntimeController({
					apiToken: 'token-123',
					notifications: {
						error: vi.fn(),
						info: vi.fn(),
						warning: vi.fn(),
						uploadCommitted: vi.fn(),
					},
				}),
			{ wrapper: createWrapper() },
		)

		expect(useTransfersDownloadQueueMock).toHaveBeenCalled()
		expect(useTransfersUploadRuntimeMock).toHaveBeenCalled()
		expect(useTransfersDownloadQueueMock.mock.lastCall?.[0]).toMatchObject({
			downloadConcurrency: 5,
			downloadLinkProxyEnabled: false,
		})
		expect(useTransfersUploadRuntimeMock.mock.lastCall?.[0]).toMatchObject({
			uploadChunkFileConcurrency: 2,
			uploadTaskConcurrency: 3,
			uploadResumeConversionEnabled: false,
		})
	})

	it('aborts in-flight transfers when the runtime unmounts', () => {
		const abortAllTransfers = vi.fn()
		useTransfersTaskActionsMock.mockReturnValue({
			updateDownloadTask: vi.fn(),
			cancelDownloadTask: vi.fn(),
			retryDownloadTask: vi.fn(),
			removeDownloadTask: vi.fn(),
			clearCompletedDownloads: vi.fn(),
			updateUploadTask: vi.fn(),
			cancelUploadTask: vi.fn(),
			removeUploadTask: vi.fn(),
			clearCompletedUploads: vi.fn(),
			abortAllTransfers,
			clearAllTransfers: vi.fn(),
		})

		const { unmount } = renderHook(
			() =>
				useTransfersRuntimeController({
					apiToken: 'token-123',
					notifications: {
						error: vi.fn(),
						info: vi.fn(),
						warning: vi.fn(),
						uploadCommitted: vi.fn(),
					},
				}),
			{ wrapper: createWrapper() },
		)

		unmount()

		expect(abortAllTransfers).toHaveBeenCalledTimes(1)
	})

	it('uses apiToken-scoped persisted transfer tabs', () => {
		window.localStorage.setItem(serverScopedStorageKey('transfers', 'token-a', 'tab'), JSON.stringify('uploads'))
		window.localStorage.setItem(serverScopedStorageKey('transfers', 'token-b', 'tab'), JSON.stringify('downloads'))

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useTransfersRuntimeController({
					apiToken,
					notifications: {
						error: vi.fn(),
						info: vi.fn(),
						warning: vi.fn(),
						uploadCommitted: vi.fn(),
					},
				}),
			{
				initialProps: { apiToken: 'token-a' },
				wrapper: createWrapper(),
			},
		)

		expect(result.current.snapshot.tab).toBe('uploads')

		rerender({ apiToken: 'token-b' })

		expect(result.current.snapshot.tab).toBe('downloads')
	})

	it('composes ctx, snapshot, and ui actions from queued transfer state', async () => {
		const queueDownloadObject = vi.fn()
		const queueUploadFiles = vi.fn()
		useTransfersDownloadQueueMock.mockImplementation(({ setDownloadTasks }: { setDownloadTasks: (value: unknown) => void }) => ({
			queueDownloadObject: (...args: unknown[]) => {
				queueDownloadObject(...args)
				setDownloadTasks([
					buildDownloadTask({ id: 'download-running', status: 'running' }),
					buildDownloadTask({ id: 'download-done', status: 'succeeded' }),
				])
			},
			queueDownloadObjectsToDevice: vi.fn(),
			queueDownloadJobArtifact: vi.fn(),
		}))
		useTransfersUploadRuntimeMock.mockImplementation(
			({ setUploadTasks, openTransfers }: { setUploadTasks: (value: unknown) => void; openTransfers: (tab?: 'downloads' | 'uploads') => void }) => ({
				retryUploadTask: vi.fn(),
				queueUploadFiles: (...args: unknown[]) => {
					queueUploadFiles(...args)
					setUploadTasks([
						buildUploadTask({ id: 'upload-waiting', status: 'waiting_job' }),
						buildUploadTask({ id: 'upload-failed', status: 'failed' }),
					])
					openTransfers('uploads')
				},
			}),
		)

		const { result } = renderHook(
			() =>
				useTransfersRuntimeController({
					apiToken: 'token-ctx',
					notifications: {
						error: vi.fn(),
						info: vi.fn(),
						warning: vi.fn(),
						uploadCommitted: vi.fn(),
					},
				}),
			{ wrapper: createWrapper() },
		)

		act(() => {
			result.current.ctx.queueDownloadObject({ profileId: 'profile-1', bucket: 'bucket-a', key: 'docs/report.pdf' })
		})
		act(() => {
			result.current.ctx.queueUploadFiles({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				files: [],
			})
		})

		await waitFor(() => expect(result.current.snapshot.activeDownloadCount).toBe(1))
		await waitFor(() => expect(result.current.snapshot.activeUploadCount).toBe(1))
		expect(result.current.snapshot.activeTransferCount).toBe(2)
		expect(result.current.snapshot.isOpen).toBe(true)
		expect(result.current.snapshot.tab).toBe('uploads')
		expect(result.current.ctx.isOpen).toBe(true)
		expect(result.current.ctx.tab).toBe('uploads')
		expect(result.current.uiState.downloadTasks).toHaveLength(2)
		expect(result.current.uiState.uploadTasks).toHaveLength(2)
		expect(queueDownloadObject).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			key: 'docs/report.pdf',
		})
		expect(queueUploadFiles).toHaveBeenCalledWith({
			profileId: 'profile-1',
			bucket: 'bucket-a',
			prefix: 'docs/',
			files: [],
		})
		expect(window.localStorage.getItem(serverScopedStorageKey('transfers', 'token-ctx', 'tab'))).toBe(JSON.stringify('uploads'))

		act(() => {
			result.current.uiActions.closeTransfers()
		})

		expect(result.current.uiState.isOpen).toBe(false)
		expect(result.current.ctx.isOpen).toBe(false)
	})

	it('revokes replaced preview URLs during updates and cleans up remaining previews on unmount', async () => {
		const queuedUploadStates = [
			[buildUploadTask({ id: 'upload-1', previewUrl: 'blob:first' })],
			[buildUploadTask({ id: 'upload-2', previewUrl: 'blob:second' })],
		]
		useTransfersUploadRuntimeMock.mockImplementation(({ setUploadTasks }: { setUploadTasks: (value: unknown) => void }) => ({
			retryUploadTask: vi.fn(),
			queueUploadFiles: vi.fn(() => {
				const next = queuedUploadStates.shift()
				if (next) setUploadTasks(next)
			}),
		}))

		const { result, unmount } = renderHook(
			() =>
				useTransfersRuntimeController({
					apiToken: 'token-preview',
					notifications: {
						error: vi.fn(),
						info: vi.fn(),
						warning: vi.fn(),
						uploadCommitted: vi.fn(),
					},
				}),
			{ wrapper: createWrapper() },
		)

		act(() => {
			result.current.ctx.queueUploadFiles({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				files: [],
			})
		})
		await waitFor(() => expect(result.current.uiState.uploadTasks[0]?.id).toBe('upload-1'))

		act(() => {
			result.current.ctx.queueUploadFiles({
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				files: [],
			})
		})

		await waitFor(() => expect(result.current.uiState.uploadTasks[0]?.id).toBe('upload-2'))
		await waitFor(() => expect(revokeObjectURLSafeMock).toHaveBeenCalledWith('blob:first'))

		unmount()

		expect(revokeObjectURLSafeMock).toHaveBeenCalledWith('blob:second')
	})
})
