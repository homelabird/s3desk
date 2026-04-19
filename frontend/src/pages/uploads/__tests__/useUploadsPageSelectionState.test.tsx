import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useUploadsPageSelectionState } from '../useUploadsPageSelectionState'

const scopedStorageRef = {
	current: {
		bucket: 'bucket-a',
		setBucket: vi.fn(),
		prefix: 'photos/',
		setPrefix: vi.fn(),
		selectedFiles: [],
		setSelectedFiles: vi.fn(),
		selectedFolderLabel: '',
		setSelectedFolderLabel: vi.fn(),
		selectedDirectorySelectionMode: undefined as 'picker' | 'input' | undefined,
		setSelectedDirectorySelectionMode: vi.fn(),
		uploadSourceOpen: false,
		setUploadSourceOpen: vi.fn(),
		uploadSourceBusy: false,
		setUploadSourceBusy: vi.fn(),
	},
}

const selectionActionsRef = {
	current: {
		selectedFileCount: 0,
		selectionKind: 'empty',
		folderSelectionSupport: { ok: true, mode: 'picker' as const },
		queueDisabledReason: 'Select a bucket first.',
		canQueueUpload: false,
		destinationLabel: 's3://bucket-a/photos/',
		clearSelection: vi.fn(),
		queueUpload: vi.fn(),
		openUploadPicker: vi.fn(),
		chooseUploadFiles: vi.fn(),
		chooseUploadFolder: vi.fn(),
	},
}

const useUploadsPageScopedStorageStateMock = vi.fn((args: unknown) => {
	void args
	return scopedStorageRef.current
})
const useUploadsPageSelectionActionsMock = vi.fn((args: unknown) => {
	void args
	return selectionActionsRef.current
})

vi.mock('../useUploadsPageScopedStorageState', () => ({
	useUploadsPageScopedStorageState: (args: unknown) => useUploadsPageScopedStorageStateMock(args),
}))

vi.mock('../useUploadsPageSelectionActions', () => ({
	useUploadsPageSelectionActions: (args: unknown) => useUploadsPageSelectionActionsMock(args),
}))

describe('useUploadsPageSelectionState', () => {
	it('composes scoped storage state and selection actions into the public selection surface', () => {
		const transfers = { openTransfers: vi.fn() } as never

		const { result } = renderHook(() =>
			useUploadsPageSelectionState({
				transfers,
				isOffline: false,
				apiToken: 'token-a',
				profileId: 'profile-1',
				uploadsSupported: true,
				uploadsUnsupportedReason: null,
			}),
		)

		expect(useUploadsPageScopedStorageStateMock).toHaveBeenCalledWith({
			apiToken: 'token-a',
			profileId: 'profile-1',
		})
		expect(useUploadsPageSelectionActionsMock).toHaveBeenCalledWith({
			transfers,
			isOffline: false,
			profileId: 'profile-1',
			uploadsSupported: true,
			uploadsUnsupportedReason: null,
			bucket: 'bucket-a',
			prefix: 'photos/',
			selectedFiles: [],
			selectedFolderLabel: '',
			selectedDirectorySelectionMode: undefined,
			setSelectedFiles: scopedStorageRef.current.setSelectedFiles,
			setSelectedFolderLabel: scopedStorageRef.current.setSelectedFolderLabel,
			setSelectedDirectorySelectionMode: scopedStorageRef.current.setSelectedDirectorySelectionMode,
			setUploadSourceOpen: scopedStorageRef.current.setUploadSourceOpen,
			setUploadSourceBusy: scopedStorageRef.current.setUploadSourceBusy,
		})
		expect(result.current).toMatchObject({
			bucket: 'bucket-a',
			prefix: 'photos/',
			selectedFiles: [],
			uploadSourceOpen: false,
			uploadSourceBusy: false,
			selectedFileCount: 0,
			selectionKind: 'empty',
			queueDisabledReason: 'Select a bucket first.',
			destinationLabel: 's3://bucket-a/photos/',
		})
	})
})
