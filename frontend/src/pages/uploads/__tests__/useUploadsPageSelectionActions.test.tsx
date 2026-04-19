import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { transfersStub } from '../../../test/transfersStub'
import { useUploadsPageSelectionActions } from '../useUploadsPageSelectionActions'

const {
	directorySupportRef,
	promptForFilesMock,
	promptForFolderFilesMock,
	messageErrorMock,
	messageInfoMock,
	messageWarningMock,
} = vi.hoisted(() => ({
	directorySupportRef: { current: { ok: true, mode: 'picker' as const } },
	promptForFilesMock: vi.fn(),
	promptForFolderFilesMock: vi.fn(),
	messageErrorMock: vi.fn(),
	messageInfoMock: vi.fn(),
	messageWarningMock: vi.fn(),
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

function createTransfersValue(overrides: Partial<typeof transfersStub> = {}) {
	return { ...transfersStub, ...overrides }
}

afterEach(() => {
	directorySupportRef.current = { ok: true, mode: 'picker' }
	promptForFilesMock.mockReset()
	promptForFolderFilesMock.mockReset()
	messageErrorMock.mockReset()
	messageInfoMock.mockReset()
	messageWarningMock.mockReset()
	vi.restoreAllMocks()
})

describe('useUploadsPageSelectionActions', () => {
	it('queues the selected folder payload and clears staged selection afterwards', async () => {
		const queueUploadFiles = vi.fn()
		const setSelectedFiles = vi.fn()
		const setSelectedFolderLabel = vi.fn()
		const setSelectedDirectorySelectionMode = vi.fn()
		const setUploadSourceOpen = vi.fn()
		const setUploadSourceBusy = vi.fn()
		const fileA = new File(['alpha'], 'a.txt', { type: 'text/plain' })
		const fileB = new File(['beta'], 'b.txt', { type: 'text/plain' })

		promptForFolderFilesMock.mockResolvedValue({
			files: [fileA, fileB],
			label: 'photos',
			mode: 'picker',
		})

		const { result, rerender } = renderHook(
			(props: { selectedFiles: File[]; label: string; mode: 'picker' | 'input' | undefined }) =>
				useUploadsPageSelectionActions({
					transfers: createTransfersValue({ queueUploadFiles }),
					isOffline: false,
					profileId: 'profile-1',
					uploadsSupported: true,
					uploadsUnsupportedReason: null,
					bucket: 'primary-bucket',
					prefix: 'photos/2024',
					selectedFiles: props.selectedFiles,
					selectedFolderLabel: props.label,
					selectedDirectorySelectionMode: props.mode,
					setSelectedFiles,
					setSelectedFolderLabel,
					setSelectedDirectorySelectionMode,
					setUploadSourceOpen,
					setUploadSourceBusy,
				}),
			{
				initialProps: {
					selectedFiles: [] as File[],
					label: '',
					mode: undefined as 'picker' | 'input' | undefined,
				},
			},
		)

		await act(async () => {
			await result.current.chooseUploadFolder()
		})

		expect(setUploadSourceBusy).toHaveBeenNthCalledWith(1, true)
		expect(setUploadSourceOpen).toHaveBeenCalledWith(false)
		expect(setSelectedFiles).toHaveBeenCalledWith([fileA, fileB])
		expect(setSelectedFolderLabel).toHaveBeenCalledWith('photos')
		expect(setSelectedDirectorySelectionMode).toHaveBeenCalledWith('picker')

		rerender({ selectedFiles: [fileA, fileB], label: 'photos', mode: 'picker' })

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
		expect(setSelectedFiles).toHaveBeenLastCalledWith([])
		expect(setSelectedFolderLabel).toHaveBeenLastCalledWith('')
		expect(setSelectedDirectorySelectionMode).toHaveBeenLastCalledWith(undefined)
		expect(messageWarningMock).not.toHaveBeenCalled()
		expect(messageErrorMock).not.toHaveBeenCalled()
	})

	it('keeps the upload picker closed and warns when offline', () => {
		const setUploadSourceOpen = vi.fn()

		const { result } = renderHook(() =>
			useUploadsPageSelectionActions({
				transfers: createTransfersValue(),
				isOffline: true,
				profileId: 'profile-1',
				uploadsSupported: true,
				uploadsUnsupportedReason: null,
				bucket: '',
				prefix: '',
				selectedFiles: [],
				selectedFolderLabel: '',
				selectedDirectorySelectionMode: undefined,
				setSelectedFiles: vi.fn(),
				setSelectedFolderLabel: vi.fn(),
				setSelectedDirectorySelectionMode: vi.fn(),
				setUploadSourceOpen,
				setUploadSourceBusy: vi.fn(),
			}),
		)

		act(() => {
			result.current.openUploadPicker()
		})

		expect(setUploadSourceOpen).not.toHaveBeenCalled()
		expect(messageWarningMock).toHaveBeenCalledWith('Offline: uploads are disabled.')
		expect(messageInfoMock).not.toHaveBeenCalled()
	})
})
