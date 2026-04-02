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
})
