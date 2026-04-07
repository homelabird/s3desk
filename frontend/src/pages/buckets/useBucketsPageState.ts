import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Grid, message } from 'antd'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIError } from '../../api/client'
import type { BucketCreateRequest, Profile } from '../../api/types'
import { queryKeys } from '../../api/queryKeys'
import { isDialogDismissed } from '../../lib/dialogPreferences'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { getProviderCapabilities, getProviderCapabilityReason } from '../../lib/providerCapabilities'
import { getBucketsQueryStaleTimeMs } from '../../lib/queryPolicy'
import { useAPIClient } from '../../api/useAPIClient'
import { buildDialogPreferenceKey } from '../../lib/dialogPreferences'
import { buildBucketDeleteJobNavigationState, buildBucketObjectsNavigationState } from './bucketNotEmptyNavigation'
import { useBucketScopedViewState } from './useBucketScopedViewState'

const BUCKET_NOT_EMPTY_DIALOG_KEY = buildDialogPreferenceKey('warning', 'bucket_not_empty')

type UseBucketsPageStateArgs = {
	apiToken: string
	profileId: string | null
}

export function useBucketsPageState({ apiToken, profileId }: UseBucketsPageStateArgs) {
	const api = useAPIClient()
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const useCompactList = !screens.lg
	const currentScopeKey = `${apiToken}:${profileId ?? 'none'}`
	const bucketsPageContextVersionRef = useRef(0)
	const latestScopeKeyRef = useRef(currentScopeKey)
	const {
		createOpen,
		deletingBucket,
		policyBucket,
		controlsBucket,
		bucketNotEmptyDialogBucket,
		setDeletingBucketState,
		setBucketNotEmptyDialogState,
		openCreateModal,
		closeCreateModal,
		openPolicyModal,
		openControlsModal,
		closePolicyModal,
		closeControlsModal,
		closeBucketNotEmptyDialog,
	} = useBucketScopedViewState(currentScopeKey)

	useLayoutEffect(() => {
		latestScopeKeyRef.current = currentScopeKey
		bucketsPageContextVersionRef.current += 1
	}, [currentScopeKey])

	const metaQuery = useQuery({
		queryKey: queryKeys.server.meta(apiToken),
		queryFn: () => api.server.getMeta(),
		retry: false,
	})

	const profilesQuery = useQuery({
		queryKey: queryKeys.profiles.list(apiToken),
		queryFn: () => api.profiles.listProfiles(),
	})

	const selectedProfile: Profile | null = useMemo(() => {
		if (!profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === profileId) ?? null
	}, [profileId, profilesQuery.data])

	const profileResolved = !profileId || profilesQuery.isSuccess
	const capabilities = selectedProfile
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const bucketCrudSupported = capabilities?.bucketCrud ?? true
	const bucketCrudUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketCrud') ?? 'Bucket operations are not supported by this profile.'
	const policySupported = capabilities
		? capabilities.bucketPolicy || capabilities.gcsIamPolicy || capabilities.azureContainerAccessPolicy
		: false
	const policyUnsupportedReason =
		getProviderCapabilityReason(capabilities, 'bucketPolicy') ??
		getProviderCapabilityReason(capabilities, 'gcsIamPolicy') ??
		getProviderCapabilityReason(capabilities, 'azureContainerAccessPolicy') ??
		'Policy management is not supported by this provider.'
	const controlsSupported =
		selectedProfile?.provider === 'aws_s3' ||
		selectedProfile?.provider === 'gcp_gcs' ||
		selectedProfile?.provider === 'azure_blob' ||
		selectedProfile?.provider === 'oci_object_storage'
	const controlsUnsupportedReason = 'Typed controls are available for AWS S3, GCS, Azure Blob, and OCI summary views.'

	const bucketsQuery = useQuery({
		queryKey: ['buckets', profileId, apiToken],
		queryFn: () => api.buckets.listBuckets(profileId!),
		enabled: !!profileId && profileResolved && bucketCrudSupported,
		staleTime: getBucketsQueryStaleTimeMs(selectedProfile?.provider),
	})

	const buckets = bucketsQuery.data ?? []
	const showBucketsEmpty = bucketCrudSupported && !bucketsQuery.isFetching && buckets.length === 0

	const createMutation = useMutation({
		mutationFn: ({
			req,
		}: {
			req: BucketCreateRequest
			contextVersion: number
		}) => api.buckets.createBucket(profileId!, req),
		onMutate: ({ contextVersion }) => ({
			contextVersion,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (_, __, context) => {
			const isCurrent =
				!context?.contextVersion ||
				context.contextVersion === bucketsPageContextVersionRef.current
			if (isCurrent) {
				message.success('Bucket created')
				closeCreateModal()
			}
			await queryClient.invalidateQueries({
				queryKey: ['buckets', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: true,
			})
		},
		onError: async (err, __, context) => {
			if (context?.contextVersion && context.contextVersion !== bucketsPageContextVersionRef.current) {
				return
			}
			if (
				err instanceof APIError &&
				err.code === 'bucket_defaults_apply_failed' &&
				err.details?.bucketCreated === true
			) {
				const applySection =
					typeof err.details?.applySection === 'string'
						? err.details.applySection.trim()
						: ''
				message.warning(
					applySection
						? `Bucket created, but secure defaults failed while applying ${applySection}.`
						: 'Bucket created, but secure defaults were not fully applied.',
				)
					await queryClient.invalidateQueries({
						queryKey: ['buckets', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
						exact: true,
					})
					closeCreateModal()
					return
				}
			message.error(formatErr(err))
		},
	})

	const deleteMutation = useMutation({
		mutationFn: ({
			bucketName,
			scopeProfileId,
		}: {
			bucketName: string
			contextVersion: number
			scopeKey: string
			scopeProfileId: string
			scopeApiToken: string
		}) => api.buckets.deleteBucket(scopeProfileId, bucketName),
		onMutate: ({ bucketName, contextVersion, scopeKey, scopeProfileId, scopeApiToken }) => {
			const mutationState = { bucketName, contextVersion, scopeKey }
			setDeletingBucketState({
				bucketName,
				scopeKey,
			})
			return {
				...mutationState,
				scopeProfileId,
				scopeApiToken,
			}
		},
		onSuccess: async (_, __, context) => {
			const isCurrent =
				!context?.contextVersion ||
				context.contextVersion === bucketsPageContextVersionRef.current
			if (isCurrent) {
				message.success('Bucket deleted')
			}
			await queryClient.invalidateQueries({
				queryKey: ['buckets', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: true,
			})
		},
		onSettled: (_, __, _vars, context) =>
			setDeletingBucketState((prev) =>
				prev?.bucketName === context?.bucketName &&
				prev?.scopeKey === context?.scopeKey
					? null
					: prev,
			),
		onError: (err, _vars, context) => {
			if (context?.contextVersion && context.contextVersion !== bucketsPageContextVersionRef.current) {
				return
			}
			const bucketName = context?.bucketName
			if (err instanceof APIError && err.code === 'bucket_not_empty') {
				if (isDialogDismissed(BUCKET_NOT_EMPTY_DIALOG_KEY, apiToken)) {
					message.warning(
						`Bucket "${bucketName ?? ''}" isn’t empty. Open Objects or create a delete job from the Buckets page.`,
					)
					return
				}
				setBucketNotEmptyDialogState({
					bucketName: bucketName ?? '',
					scopeKey: currentScopeKey,
				})
				return
			}
			message.error(formatErr(err))
		},
	})

	const submitCreateBucket = (req: BucketCreateRequest) =>
		createMutation.mutate({
			req,
			contextVersion: bucketsPageContextVersionRef.current,
		})
	const deleteBucket = async (bucketName: string) =>
	{
		if (!profileId) return
		const scopeKey = currentScopeKey
		if (scopeKey !== latestScopeKeyRef.current) return
		return deleteMutation.mutateAsync({
			bucketName,
			contextVersion: bucketsPageContextVersionRef.current,
			scopeKey,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		})
	}

	const openBucketNotEmptyObjects = () => {
		if (!bucketNotEmptyDialogBucket) return
		setBucketNotEmptyDialogState(null)
		navigate('/objects', {
			state: buildBucketObjectsNavigationState(bucketNotEmptyDialogBucket),
		})
	}
	const openBucketNotEmptyDeleteJob = () => {
		if (!bucketNotEmptyDialogBucket) return
		setBucketNotEmptyDialogState(null)
		navigate('/jobs', {
			state: buildBucketDeleteJobNavigationState(bucketNotEmptyDialogBucket),
		})
	}

	return {
		api,
		useCompactList,
			metaQuery,
			profilesQuery,
			selectedProfile,
			profileResolved,
			capabilities,
		bucketCrudSupported,
		bucketCrudUnsupportedReason,
		policySupported,
		policyUnsupportedReason,
		controlsSupported,
		controlsUnsupportedReason,
		bucketsQuery,
		buckets,
		showBucketsEmpty,
		currentScopeKey,
		createOpen,
		openCreateModal,
		closeCreateModal,
		createMutation,
		deleteMutation,
		submitCreateBucket,
		deleteBucket,
		deletingBucket,
		openPolicyModal,
		openControlsModal,
		closePolicyModal,
		closeControlsModal,
		policyBucket,
		controlsBucket,
		bucketNotEmptyDialogBucket,
		closeBucketNotEmptyDialog,
		openBucketNotEmptyObjects,
		openBucketNotEmptyDeleteJob,
	}
}
