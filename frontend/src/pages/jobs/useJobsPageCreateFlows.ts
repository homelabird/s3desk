import { useMutation, type QueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { DeleteJobPrefill } from './jobsPageTypes'
import { jobsFeedback } from './jobsFeedback'

type DeletePrefixJobPayload = {
  bucket: string
  prefix: string
  deleteAll: boolean
  allowUnsafePrefix: boolean
  include: string[]
  exclude: string[]
  dryRun: boolean
}

type UseJobsPageCreateFlowsArgs = {
  apiToken: string
  profileId: string | null
  queryClient: QueryClient
  createJobWithRetry: (req: {
    type: 'transfer_delete_prefix'
    payload: DeletePrefixJobPayload
  }) => Promise<{ id: string }>
  setCreateDeleteOpen: (next: boolean) => void
  setDeleteJobPrefill: (next: DeleteJobPrefill | null) => void
  beginDeleteRequest: () => number
  isCurrentDeleteRequest: (token: number) => boolean
}

export function useJobsPageCreateFlows({
  apiToken,
  profileId,
  queryClient,
  createJobWithRetry,
  setCreateDeleteOpen,
  setDeleteJobPrefill,
  beginDeleteRequest,
  isCurrentDeleteRequest,
}: UseJobsPageCreateFlowsArgs) {
  const deleteSubmittingRef = useRef(false)

  const createDeleteMutation = useMutation({
    mutationFn: (payload: DeletePrefixJobPayload) =>
      createJobWithRetry({ type: 'transfer_delete_prefix', payload }),
    onMutate: () => {
      const requestToken = beginDeleteRequest()
      return {
        requestToken,
        scopeProfileId: profileId,
        scopeApiToken: apiToken,
      }
    },
    onSuccess: async (job, _vars, context) => {
      const isCurrent = !context?.requestToken || isCurrentDeleteRequest(context.requestToken)
      if (isCurrent) {
        jobsFeedback.deleteJobCreated(job.id)
        setCreateDeleteOpen(false)
        setDeleteJobPrefill(null)
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.jobs.scope(context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken),
        exact: false,
      })
    },
    onError: (err, _vars, context) => {
      if (context?.requestToken && !isCurrentDeleteRequest(context.requestToken)) return
      jobsFeedback.error(err)
    },
    onSettled: () => {
      deleteSubmittingRef.current = false
    },
  })

  const onCreateDelete = useCallback((values: DeletePrefixJobPayload) => {
    if (deleteSubmittingRef.current || createDeleteMutation.isPending) return
    deleteSubmittingRef.current = true
    createDeleteMutation.mutate(values)
  }, [createDeleteMutation])

  return {
    createDeleteMutation,
    onCreateDelete,
  }
}
