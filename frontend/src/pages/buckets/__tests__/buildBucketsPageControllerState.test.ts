import { describe, expect, it, vi } from 'vitest'

import { buildBucketsPageControllerState } from '../buildBucketsPageControllerState'

describe('buildBucketsPageControllerState', () => {
	it('builds grouped controller state from scoped, query, and feature state', () => {
		const api = { buckets: {} }
		const scopeState = {
			currentScopeKey: 'token-a:profile-1',
			openCreateModal: vi.fn(),
			createOpen: true,
			closeCreateModal: vi.fn(),
			deletingBucket: 'primary-bucket',
			bucketNotEmptyDialogBucket: 'archive-bucket',
			closeBucketNotEmptyDialog: vi.fn(),
		}
		const queriesState = {
			selectedProfile: { id: 'profile-1', provider: 'aws_s3' },
			profileResolved: true,
			bucketCrudSupported: true,
			bucketCrudUnsupportedReason: '',
			bucketsQuery: {
				isPending: false,
				isFetching: false,
				isError: false,
				error: null,
			},
			buckets: [{ name: 'primary-bucket', createdAt: '2026-04-08T00:00:00Z' }],
			showBucketsEmpty: false,
		}
		const featureState = {
			policyBucket: 'primary-bucket',
			policySupported: true,
			policyUnsupportedReason: '',
			controlsBucket: 'archive-bucket',
			controlsSupported: false,
			controlsUnsupportedReason: 'Not supported',
			openPolicyModal: vi.fn(),
			openControlsModal: vi.fn(),
			closePolicyModal: vi.fn(),
			closeControlsModal: vi.fn(),
			createMutation: { isPending: true },
			submitCreateBucket: vi.fn(),
			deleteMutation: { isPending: true },
			deleteBucket: vi.fn(),
			openObjectsBucket: vi.fn(),
			openBucketNotEmptyObjects: vi.fn(),
			openBucketNotEmptyDeleteJob: vi.fn(),
		}

		const result = buildBucketsPageControllerState({
			api: api as never,
			scopeState: scopeState as never,
			queriesState: queriesState as never,
			featureState: featureState as never,
			useCompactList: true,
		})

		expect(result.currentScopeKey).toBe('token-a:profile-1')
		expect(result.queries).toBe(queriesState)
		expect(result.shell).toEqual({
			api,
			selectedProfile: queriesState.selectedProfile,
			bucketCrudSupported: true,
			bucketCrudUnsupportedReason: '',
			bucketsQueryError: null,
			bucketsLoading: false,
			buckets: queriesState.buckets,
			showBucketsEmpty: false,
			openCreateModal: scopeState.openCreateModal,
			createOpen: true,
			closeCreateModal: scopeState.closeCreateModal,
			submitCreateBucket: featureState.submitCreateBucket,
			createLoading: true,
			selectedProfileProvider: 'aws_s3',
			list: {
				buckets: queriesState.buckets,
				useCompactList: true,
				policySupported: true,
				policyUnsupportedReason: '',
				controlsSupported: false,
				controlsUnsupportedReason: 'Not supported',
				deletePending: true,
				deletingBucket: 'primary-bucket',
				onOpenObjects: featureState.openObjectsBucket,
				onOpenControls: featureState.openControlsModal,
				onOpenPolicy: featureState.openPolicyModal,
				onDelete: featureState.deleteBucket,
			},
			dialogs: {
				policyBucket: 'primary-bucket',
				closePolicyModal: featureState.closePolicyModal,
				openControlsModal: featureState.openControlsModal,
				controlsBucket: 'archive-bucket',
				closeControlsModal: featureState.closeControlsModal,
				openPolicyModal: featureState.openPolicyModal,
				bucketNotEmptyDialogBucket: 'archive-bucket',
				closeBucketNotEmptyDialog: scopeState.closeBucketNotEmptyDialog,
				openBucketNotEmptyObjects: featureState.openBucketNotEmptyObjects,
				openBucketNotEmptyDeleteJob: featureState.openBucketNotEmptyDeleteJob,
			},
		})
	})

	it('marks buckets loading when the selected profile is still resolving an empty supported list', () => {
		const result = buildBucketsPageControllerState({
			api: {} as never,
			scopeState: {
				currentScopeKey: 'token-a:profile-1',
				openCreateModal: vi.fn(),
				createOpen: false,
				closeCreateModal: vi.fn(),
				deletingBucket: null,
				bucketNotEmptyDialogBucket: null,
				closeBucketNotEmptyDialog: vi.fn(),
			} as never,
			queriesState: {
				selectedProfile: { id: 'profile-1', provider: 'aws_s3' },
				profileResolved: false,
				bucketCrudSupported: true,
				bucketCrudUnsupportedReason: '',
				bucketsQuery: {
					isPending: true,
					isFetching: true,
					isError: false,
					error: null,
				},
				buckets: [],
				showBucketsEmpty: false,
			} as never,
			featureState: {
				policyBucket: null,
				policySupported: true,
				policyUnsupportedReason: '',
				controlsBucket: null,
				controlsSupported: true,
				controlsUnsupportedReason: '',
				openPolicyModal: vi.fn(),
				openControlsModal: vi.fn(),
				closePolicyModal: vi.fn(),
				closeControlsModal: vi.fn(),
				createMutation: { isPending: false },
				submitCreateBucket: vi.fn(),
				deleteMutation: { isPending: false },
				deleteBucket: vi.fn(),
				openObjectsBucket: vi.fn(),
				openBucketNotEmptyObjects: vi.fn(),
				openBucketNotEmptyDeleteJob: vi.fn(),
			} as never,
			useCompactList: false,
		})

		expect(result.shell.bucketsLoading).toBe(true)
	})
})
