import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react'
import type { NavigateFunction } from 'react-router-dom'

import { APIError, type APIClient } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import { buildDialogPreferenceKey, isDialogDismissed } from '../../lib/dialogPreferences'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { buildBucketDeleteJobNavigationState, buildBucketObjectsNavigationState } from './bucketNotEmptyNavigation'
import type { ScopedBucketState } from './useBucketScopedViewState'

const BUCKET_NOT_EMPTY_DIALOG_KEY = buildDialogPreferenceKey('warning', 'bucket_not_empty')

type UseBucketsPageDeleteFlowArgs = {
  api: APIClient
  apiToken: string
  profileId: string | null
  queryClient: QueryClient
  navigate: NavigateFunction
  currentScopeKey: string
  latestScopeKeyRef: MutableRefObject<string>
  bucketsPageContextVersionRef: MutableRefObject<number>
  bucketNotEmptyDialogBucket: string | null
  setDeletingBucketState: Dispatch<SetStateAction<ScopedBucketState | null>>
  setBucketNotEmptyDialogState: Dispatch<SetStateAction<ScopedBucketState | null>>
}

export function useBucketsPageDeleteFlow({
  api,
  apiToken,
  profileId,
  queryClient,
  navigate,
  currentScopeKey,
  latestScopeKeyRef,
  bucketsPageContextVersionRef,
  bucketNotEmptyDialogBucket,
  setDeletingBucketState,
  setBucketNotEmptyDialogState,
}: UseBucketsPageDeleteFlowArgs) {
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
        queryKey: queryKeys.buckets.list(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
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

  const deleteBucket = useCallback(async (bucketName: string) => {
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
  }, [apiToken, bucketsPageContextVersionRef, currentScopeKey, deleteMutation, latestScopeKeyRef, profileId])

  const openBucketNotEmptyObjects = useCallback(() => {
    if (!bucketNotEmptyDialogBucket) return
    setBucketNotEmptyDialogState(null)
    navigate('/objects', {
      state: buildBucketObjectsNavigationState(bucketNotEmptyDialogBucket),
    })
  }, [bucketNotEmptyDialogBucket, navigate, setBucketNotEmptyDialogState])

  const openBucketNotEmptyDeleteJob = useCallback(() => {
    if (!bucketNotEmptyDialogBucket) return
    setBucketNotEmptyDialogState(null)
    navigate('/jobs', {
      state: buildBucketDeleteJobNavigationState(bucketNotEmptyDialogBucket),
    })
  }, [bucketNotEmptyDialogBucket, navigate, setBucketNotEmptyDialogState])

  return {
    deleteMutation,
    deleteBucket,
    openBucketNotEmptyObjects,
    openBucketNotEmptyDeleteJob,
  }
}
