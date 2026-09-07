import { useMutation, type QueryClient } from '@tanstack/react-query'
import { useCallback, type MutableRefObject } from 'react'

import { APIError, type APIClientShape } from '../../api/client'
import type { BucketCreateRequest } from '../../api/types'
import { queryKeys } from '../../api/queryKeys'
import { bucketsFeedback } from './bucketsFeedback'

type UseBucketsPageCreateStateArgs = {
	api: APIClientShape
	apiToken: string
	profileId: string | null
	queryClient: QueryClient
	bucketsPageContextVersionRef: MutableRefObject<number>
	closeCreateModal: () => void
}

export function useBucketsPageCreateState({
	api,
	apiToken,
	profileId,
	queryClient,
	bucketsPageContextVersionRef,
	closeCreateModal,
}: UseBucketsPageCreateStateArgs) {
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
				bucketsFeedback.bucketCreated()
				closeCreateModal()
			}
			await queryClient.invalidateQueries({
				queryKey: queryKeys.buckets.list(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
				exact: true,
			})
		},
		onError: async (err, __, context) => {
			const bucketCreated =
				err instanceof APIError &&
				err.code === 'bucket_defaults_apply_failed' &&
				err.details?.bucketCreated === true
			if (bucketCreated) {
				await queryClient.invalidateQueries({
					queryKey: queryKeys.buckets.list(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
					exact: true,
				})
			}
			if (context?.contextVersion && context.contextVersion !== bucketsPageContextVersionRef.current) {
				return
			}
			if (bucketCreated) {
				const applySection =
					typeof err.details?.applySection === 'string'
						? err.details.applySection.trim()
						: ''
				bucketsFeedback.secureDefaultsApplyFailed(applySection)
				closeCreateModal()
				return
			}
			bucketsFeedback.error(err)
		},
	})

	const submitCreateBucket = useCallback(
		(req: BucketCreateRequest) =>
			createMutation.mutate({
				req,
				contextVersion: bucketsPageContextVersionRef.current,
			}),
		[createMutation, bucketsPageContextVersionRef],
	)

	return {
		createMutation,
		submitCreateBucket,
	}
}
