import '@testing-library/jest-dom/vitest'
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const confirmDangerActionMock = vi.fn()

vi.mock('../../../lib/confirmDangerAction', () => ({
	confirmDangerAction: (options: unknown) => confirmDangerActionMock(options),
}))

import { useObjectsDeleteConfirm } from '../useObjectsDeleteConfirm'

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('useObjectsDeleteConfirm', () => {
	it('ignores stale single-delete confirmations after the objects context changes', async () => {
		const deleteMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }
		const deletePrefixJobMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }

		const { result, rerender } = renderHook(
			({ apiToken, profileId, bucket, prefix }) =>
				useObjectsDeleteConfirm({
					apiToken,
					profileId,
					bucket,
					prefix,
					selectedKeys: new Set(['logs/app.log']),
					deleteMutation,
					deletePrefixJobMutation,
				}),
			{
				initialProps: { apiToken: 'token-1', profileId: 'profile-1', bucket: 'bucket-a', prefix: 'logs/' },
			},
		)

		act(() => {
			result.current.confirmDeleteObjects(['logs/app.log'])
		})

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		rerender({ apiToken: 'token-1', profileId: 'profile-2', bucket: 'bucket-b', prefix: 'archive/' })

		await act(async () => {
			await confirmCall?.onConfirm()
		})

		expect(deleteMutation.mutateAsync).not.toHaveBeenCalled()
	})

	it('ignores stale single-delete confirmations after the api token changes', async () => {
		const deleteMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }
		const deletePrefixJobMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }

		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsDeleteConfirm({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'logs/',
					selectedKeys: new Set(['logs/app.log']),
					deleteMutation,
					deletePrefixJobMutation,
				}),
			{
				initialProps: { apiToken: 'token-1' },
			},
		)

		act(() => {
			result.current.confirmDeleteObjects(['logs/app.log'])
		})

		const confirmCall = confirmDangerActionMock.mock.calls.at(-1)?.[0] as { onConfirm: () => Promise<void> | void } | undefined
		expect(confirmCall).toBeDefined()

		rerender({ apiToken: 'token-2' })

		await act(async () => {
			await confirmCall?.onConfirm()
		})

		expect(deleteMutation.mutateAsync).not.toHaveBeenCalled()
	})

	it('ignores stale prefix-delete confirmations after the dialog closes and reopens', async () => {
		const pendingDelete = deferred<unknown>()
		const deleteMutation = { mutateAsync: vi.fn().mockResolvedValue(undefined) }
		const deletePrefixJobMutation = { mutateAsync: vi.fn().mockReturnValue(pendingDelete.promise) }

		const { result } = renderHook(() =>
			useObjectsDeleteConfirm({
				apiToken: 'token-1',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'logs/',
				selectedKeys: new Set<string>(),
				deleteMutation,
				deletePrefixJobMutation,
			}),
		)

		act(() => {
			result.current.confirmDeletePrefixAsJob(false, 'logs/')
		})

		let confirmPromise!: Promise<void>
		act(() => {
			confirmPromise = result.current.handleDeletePrefixConfirm()
		})

		act(() => {
			result.current.handleDeletePrefixCancel()
			result.current.confirmDeletePrefixAsJob(true, 'other/')
		})

		await act(async () => {
			pendingDelete.resolve(undefined)
			await confirmPromise
		})

		expect(result.current.deletePrefixConfirmOpen).toBe(true)
		expect(result.current.deletePrefixConfirmPrefix).toBe('other/')
		expect(result.current.deletePrefixConfirmDryRun).toBe(true)
		expect(result.current.deletePrefixConfirmText).toBe('')
	})
})
