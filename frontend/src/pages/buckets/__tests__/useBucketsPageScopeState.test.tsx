import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useBucketsPageScopeState } from '../useBucketsPageScopeState'

describe('useBucketsPageScopeState', () => {
	it('tracks scope changes and hides stale scoped view state', () => {
		const { result, rerender } = renderHook(
			(props: { apiToken: string; profileId: string | null }) =>
				useBucketsPageScopeState(props),
			{
				initialProps: { apiToken: 'token-a', profileId: 'profile-1' },
			},
		)

		expect(result.current.currentScopeKey).toBe('token-a:profile-1')
		expect(result.current.latestScopeKeyRef.current).toBe('token-a:profile-1')
		expect(result.current.bucketsPageContextVersionRef.current).toBe(1)

		act(() => {
			result.current.openCreateModal()
			result.current.setDeletingBucketState({
				bucketName: 'primary-bucket',
				scopeKey: 'token-a:profile-1',
			})
			result.current.setBucketNotEmptyDialogState({
				bucketName: 'primary-bucket',
				scopeKey: 'token-a:profile-1',
			})
		})

		expect(result.current.createOpen).toBe(true)
		expect(result.current.deletingBucket).toBe('primary-bucket')
		expect(result.current.bucketNotEmptyDialogBucket).toBe('primary-bucket')

		rerender({ apiToken: 'token-b', profileId: 'profile-1' })

		expect(result.current.currentScopeKey).toBe('token-b:profile-1')
		expect(result.current.latestScopeKeyRef.current).toBe('token-b:profile-1')
		expect(result.current.bucketsPageContextVersionRef.current).toBe(2)
		expect(result.current.createOpen).toBe(false)
		expect(result.current.deletingBucket).toBe(null)
		expect(result.current.bucketNotEmptyDialogBucket).toBe(null)
	})
})
