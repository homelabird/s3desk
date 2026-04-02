import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook } from '@testing-library/react'
import type { PropsWithChildren } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serverScopedStorageKey } from '../../../lib/profileScopedStorage'

const {
	apiClientConstructorMock,
	useTransfersDownloadQueueMock,
	useTransfersPersistenceMock,
	useTransfersTaskActionsMock,
	useTransfersUploadJobLifecycleMock,
	useTransfersUploadPreferencesMock,
	useTransfersUploadRuntimeMock,
} = vi.hoisted(() => ({
	apiClientConstructorMock: vi.fn(),
	useTransfersDownloadQueueMock: vi.fn(),
	useTransfersPersistenceMock: vi.fn(),
	useTransfersTaskActionsMock: vi.fn(),
	useTransfersUploadJobLifecycleMock: vi.fn(),
	useTransfersUploadPreferencesMock: vi.fn(),
	useTransfersUploadRuntimeMock: vi.fn(),
}))

vi.mock('../../../api/client', () => ({
	APIClient: apiClientConstructorMock,
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

import { useTransfersRuntimeController } from '../useTransfersRuntimeController'

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
		apiClientConstructorMock.mockImplementation(() => ({}))
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

		expect(apiClientConstructorMock).toHaveBeenCalledWith({ apiToken: 'token-123' })
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
})
