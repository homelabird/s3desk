import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useCallback, type MutableRefObject } from 'react'

import { APIError, type APIClient } from '../../api/client'
import type { BucketCreateRequest } from '../../api/types'
import { queryKeys } from '../../api/queryKeys'
import { formatErrorWithHint as formatErr } from '../../lib/errors'

type UseBucketsPageCreateStateArgs = {
	api: APIClient
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
				message.success('Bucket created')
				closeCreateModal()
			}
			await queryClient.invalidateQueries({
				queryKey: queryKeys.buckets.list(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
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
					queryKey: queryKeys.buckets.list(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
					exact: true,
				})
				closeCreateModal()
				return
			}
			message.error(formatErr(err))
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
