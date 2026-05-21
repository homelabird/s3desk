import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useBucketsPageFeatureState } from '../useBucketsPageFeatureState'

const useBucketsPageOverlaysStateMock = vi.fn()
const useBucketsPageCreateStateMock = vi.fn()
const useBucketsPageDeleteFlowMock = vi.fn()

vi.mock('../useBucketsPageOverlaysState', () => ({
	useBucketsPageOverlaysState: (...args: unknown[]) => useBucketsPageOverlaysStateMock(...args),
}))

vi.mock('../useBucketsPageCreateState', () => ({
	useBucketsPageCreateState: (...args: unknown[]) => useBucketsPageCreateStateMock(...args),
}))

vi.mock('../useBucketsPageDeleteFlow', () => ({
	useBucketsPageDeleteFlow: (...args: unknown[]) => useBucketsPageDeleteFlowMock(...args),
}))

describe('useBucketsPageFeatureState', () => {
	it('composes overlay, create, and delete flows from scoped buckets page state', () => {
		const navigate = vi.fn()
		const scopeState = {
			currentScopeKey: 'token-a:profile-1',
			latestScopeKeyRef: { current: 'token-a:profile-1' },
			bucketsPageContextVersionRef: { current: 3 },
			closeCreateModal: vi.fn(),
			bucketNotEmptyDialogBucket: 'primary-bucket',
			setDeletingBucketState: vi.fn(),
			setBucketNotEmptyDialogState: vi.fn(),
		}
		const selectedProfile = { id: 'profile-1', provider: 'aws_s3' }
		const capabilities = { bucketPolicy: true }
		const overlaysState = { openPolicyModal: vi.fn(), policySupported: true }
		const createState = { submitCreateBucket: vi.fn(), createMutation: { isPending: false } }
		const deleteFlow = { deleteBucket: vi.fn(), deleteMutation: { isPending: false } }

		useBucketsPageOverlaysStateMock.mockReturnValue(overlaysState)
		useBucketsPageCreateStateMock.mockReturnValue(createState)
		useBucketsPageDeleteFlowMock.mockReturnValue(deleteFlow)

		const { result } = renderHook(() =>
			useBucketsPageFeatureState({
				api: { buckets: {} } as never,
				apiToken: 'token-a',
				profileId: 'profile-1',
				queryClient: { invalidateQueries: vi.fn() } as never,
				navigate,
				scopeState: scopeState as never,
				selectedProfile: selectedProfile as never,
				capabilities: capabilities as never,
			}),
		)

		expect(useBucketsPageOverlaysStateMock).toHaveBeenCalledWith({
			currentScopeKey: 'token-a:profile-1',
			selectedProfile,
			capabilities,
		})
		expect(useBucketsPageCreateStateMock).toHaveBeenCalledWith({
			api: { buckets: {} },
			apiToken: 'token-a',
			profileId: 'profile-1',
			queryClient: expect.objectContaining({
				invalidateQueries: expect.any(Function),
			}),
			bucketsPageContextVersionRef: scopeState.bucketsPageContextVersionRef,
			closeCreateModal: scopeState.closeCreateModal,
		})
		expect(useBucketsPageDeleteFlowMock).toHaveBeenCalledWith({
			api: { buckets: {} },
			apiToken: 'token-a',
			profileId: 'profile-1',
			queryClient: expect.objectContaining({
				invalidateQueries: expect.any(Function),
			}),
			navigate: expect.any(Function),
			currentScopeKey: 'token-a:profile-1',
			latestScopeKeyRef: scopeState.latestScopeKeyRef,
			bucketsPageContextVersionRef: scopeState.bucketsPageContextVersionRef,
			bucketNotEmptyDialogBucket: 'primary-bucket',
			setDeletingBucketState: scopeState.setDeletingBucketState,
			setBucketNotEmptyDialogState: scopeState.setBucketNotEmptyDialogState,
		})
		expect(result.current).toEqual({
			...overlaysState,
			...createState,
			...deleteFlow,
			openObjectsBucket: expect.any(Function),
		})
		result.current.openObjectsBucket('primary-bucket')
		expect(navigate).toHaveBeenCalledWith('/objects', {
			state: {
				openBucket: true,
				bucket: 'primary-bucket',
				prefix: '',
			},
		})
	})
})
