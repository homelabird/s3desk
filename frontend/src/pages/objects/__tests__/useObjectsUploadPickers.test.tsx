import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as uploadUtils from '../../../components/transfers/transfersUploadUtils'
import { useObjectsUploadPickers } from '../useObjectsUploadPickers'

const messageErrorMock = vi.fn()
const messageWarningMock = vi.fn()

vi.mock('antd', async () => {
	const actual = await vi.importActual<typeof import('antd')>('antd')
	return {
		...actual,
		message: {
			error: (...args: unknown[]) => messageErrorMock(...args),
			warning: (...args: unknown[]) => messageWarningMock(...args),
		},
	}
})

describe('useObjectsUploadPickers', () => {
	afterEach(() => {
		vi.restoreAllMocks()
		messageErrorMock.mockClear()
		messageWarningMock.mockClear()
	})

	it('ignores a stale file selection after the api token changes', async () => {
		let resolveFiles: ((files: File[] | null) => void) | null = null
		vi.spyOn(uploadUtils, 'promptForFiles').mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFiles = resolve
				}),
		)
		const startUploadFromFiles = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken }) =>
				useObjectsUploadPickers({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'folder/',
					isOffline: false,
					uploadsEnabled: true,
					uploadsDisabledReason: null,
					startUploadFromFiles,
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.openUploadPicker()
		})

		await act(async () => {
			void result.current.chooseUploadFiles()
		})

		rerender({ apiToken: 'token-b' })

		await act(async () => {
			resolveFiles?.([new File(['alpha'], 'alpha.txt', { type: 'text/plain' })])
			await Promise.resolve()
		})

		expect(startUploadFromFiles).not.toHaveBeenCalled()
		expect(result.current.uploadSourceOpen).toBe(false)
		expect(result.current.uploadSourceBusy).toBe(false)
	})

	it('ignores a stale folder selection after the api token changes', async () => {
		let resolveFolder: ((value: Awaited<ReturnType<typeof uploadUtils.promptForFolderFiles>>) => void) | null = null
		vi.spyOn(uploadUtils, 'promptForFolderFiles').mockImplementation(
			() =>
				new Promise((resolve) => {
					resolveFolder = resolve
				}),
		)
		const startUploadFromFiles = vi.fn()

		const { result, rerender } = renderHook(
			({ apiToken }) =>
				useObjectsUploadPickers({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'folder/',
					isOffline: false,
					uploadsEnabled: true,
					uploadsDisabledReason: null,
					startUploadFromFiles,
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.openUploadPicker()
		})

		await act(async () => {
			void result.current.chooseUploadFolder()
		})

		rerender({ apiToken: 'token-b' })

		await act(async () => {
			resolveFolder?.({
				files: [new File(['alpha'], 'alpha.txt', { type: 'text/plain' })],
				label: 'folder',
				mode: 'picker',
			})
			await Promise.resolve()
		})

		expect(startUploadFromFiles).not.toHaveBeenCalled()
		expect(result.current.uploadSourceOpen).toBe(false)
		expect(result.current.uploadSourceBusy).toBe(false)
	})

	it('aborts folder enumeration on unmount before it can queue a stale upload', async () => {
		let resolveFolder!: (value: Awaited<ReturnType<typeof uploadUtils.promptForFolderFiles>>) => void
		let requestSignal: AbortSignal | undefined
		vi.spyOn(uploadUtils, 'promptForFolderFiles').mockImplementation(
			(options) =>
				new Promise((resolve) => {
					requestSignal = options?.signal
					resolveFolder = resolve
				}),
		)
		const startUploadFromFiles = vi.fn()
		const { result, unmount } = renderHook(() =>
			useObjectsUploadPickers({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'folder/',
				isOffline: false,
				uploadsEnabled: true,
				uploadsDisabledReason: null,
				startUploadFromFiles,
			}),
		)

		act(() => {
			result.current.openUploadPicker()
		})
		let pending!: Promise<void>
		act(() => {
			pending = result.current.chooseUploadFolder()
		})

		expect(result.current.uploadSourceOpen).toBe(true)
		expect(result.current.uploadSourceBusy).toBe(true)
		unmount()
		expect(requestSignal?.aborted).toBe(true)

		resolveFolder({
			files: [new File(['alpha'], 'alpha.txt', { type: 'text/plain' })],
			label: 'folder',
			mode: 'picker',
		})
		await pending

		expect(startUploadFromFiles).not.toHaveBeenCalled()
	})

	it('does not resurrect an open upload sheet after leaving and returning to a scope', () => {
		const { result, rerender } = renderHook(
			({ apiToken }) =>
				useObjectsUploadPickers({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'folder/',
					isOffline: false,
					uploadsEnabled: true,
					uploadsDisabledReason: null,
					startUploadFromFiles: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.openUploadPicker()
		})
		rerender({ apiToken: 'token-b' })
		rerender({ apiToken: 'token-a' })

		expect(result.current.uploadSourceOpen).toBe(false)
		expect(result.current.uploadSourceBusy).toBe(false)
	})
})
