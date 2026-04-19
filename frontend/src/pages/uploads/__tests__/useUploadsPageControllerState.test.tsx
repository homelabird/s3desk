import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useUploadsPageControllerState } from '../useUploadsPageControllerState'

const queriesStateRef = {
	current: {
		selectedProfile: { id: 'profile-1', name: 'Primary Profile', provider: 's3_compatible' },
		uploadsSupported: true,
		uploadsUnsupportedReason: null,
		bucketsQuery: { isSuccess: true },
		bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
		showBucketsEmpty: false,
	},
}

const selectionStateRef = {
	current: {
		bucket: 'bucket-a',
		setBucket: vi.fn(),
		prefix: 'photos/',
		setPrefix: vi.fn(),
		selectedFiles: [],
		selectedFileCount: 0,
		selectionKind: 'empty',
		uploadSourceOpen: false,
		setUploadSourceOpen: vi.fn(),
		uploadSourceBusy: false,
		canQueueUpload: false,
		queueDisabledReason: 'Select a bucket first.',
		folderSelectionSupport: { ok: true, mode: 'picker' as const },
		destinationLabel: 's3://bucket-a/photos/',
		clearSelection: vi.fn(),
		queueUpload: vi.fn(),
		openUploadPicker: vi.fn(),
		chooseUploadFiles: vi.fn(),
		chooseUploadFolder: vi.fn(),
	},
}

const useUploadsPageQueriesStateMock = vi.fn((args: unknown) => {
	void args
	return queriesStateRef.current
})
const useUploadsPageSelectionStateMock = vi.fn((args: unknown) => {
	void args
	return selectionStateRef.current
})

vi.mock('../useUploadsPageQueriesState', () => ({
	useUploadsPageQueriesState: (args: unknown) => useUploadsPageQueriesStateMock(args),
}))

vi.mock('../useUploadsPageSelectionState', () => ({
	useUploadsPageSelectionState: (args: unknown) => useUploadsPageSelectionStateMock(args),
}))

describe('useUploadsPageControllerState', () => {
	it('composes query state and selection state into the page controller surface', () => {
		const transfers = { openTransfers: vi.fn() } as never
		const api = { server: {}, profiles: {}, buckets: {} } as never

		const { result } = renderHook(() =>
			useUploadsPageControllerState({
				api,
				transfers,
				isOffline: false,
				apiToken: 'token-a',
				profileId: 'profile-1',
			}),
		)

		expect(useUploadsPageQueriesStateMock).toHaveBeenCalledWith({
			api,
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(useUploadsPageSelectionStateMock).toHaveBeenCalledWith({
			transfers,
			isOffline: false,
			apiToken: 'token-a',
			profileId: 'profile-1',
			uploadsSupported: true,
			uploadsUnsupportedReason: null,
		})
		expect(result.current).toMatchObject({
			transfers,
			isOffline: false,
			selectedProfile: { id: 'profile-1', name: 'Primary Profile' },
			bucket: 'bucket-a',
			bucketOptions: [{ label: 'bucket-a', value: 'bucket-a' }],
			queueDisabledReason: 'Select a bucket first.',
			destinationLabel: 's3://bucket-a/photos/',
		})
	})
})
