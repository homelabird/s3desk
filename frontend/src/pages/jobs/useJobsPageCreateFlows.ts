import { useMutation, type QueryClient } from '@tanstack/react-query'
import { useCallback, useRef } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { APIClientShape } from '../../api/client'
import type { TransfersContextValue } from '../../components/transfersTypes'
import { listAllObjects } from '../../lib/objects'
import type { DeleteJobPrefill } from './jobsPageTypes'
import { normalizePrefix as normalizeJobPrefix } from './jobUtils'
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
  api: APIClientShape
  apiToken: string
  profileId: string | null
  queryClient: QueryClient
  transfers: TransfersContextValue
  uploadSupported: boolean
  uploadDisabledReason: string | null
  createJobWithRetry: (req: {
    type: 'transfer_delete_prefix'
    payload: DeletePrefixJobPayload
  }) => Promise<{ id: string }>
  beginDownloadRequest: () => number
  isCurrentDownloadRequest: (token: number) => boolean
  setCreateOpen: (next: boolean) => void
  setCreateDownloadOpen: (next: boolean) => void
  setCreateDeleteOpen: (next: boolean) => void
  setDeviceUploadLoading: (next: boolean) => void
  setDeviceDownloadLoading: (next: boolean) => void
  setDeleteJobPrefill: (next: DeleteJobPrefill | null) => void
  beginDeleteRequest: () => number
  isCurrentDeleteRequest: (token: number) => boolean
}

export function useJobsPageCreateFlows({
  api,
  apiToken,
  profileId,
  queryClient,
  transfers,
  uploadSupported,
  uploadDisabledReason,
  createJobWithRetry,
  beginDownloadRequest,
  isCurrentDownloadRequest,
  setCreateOpen,
  setCreateDownloadOpen,
  setCreateDeleteOpen,
  setDeviceUploadLoading,
  setDeviceDownloadLoading,
  setDeleteJobPrefill,
  beginDeleteRequest,
  isCurrentDeleteRequest,
}: UseJobsPageCreateFlowsArgs) {
  const deleteSubmittingRef = useRef(false)
  const uploadSubmittingRef = useRef(false)

  const onCreateUpload = useCallback(async (args: {
    bucket: string
    prefix: string
    files: File[]
    label?: string
    directorySelectionMode?: 'picker' | 'input'
  }) => {
    if (uploadSubmittingRef.current) return
    if (!profileId) return
    if (!uploadSupported) {
      jobsFeedback.uploadsUnsupported(uploadDisabledReason)
      return
    }
    uploadSubmittingRef.current = true
    setDeviceUploadLoading(true)
    try {
      if (args.files.length === 0) {
        jobsFeedback.noFilesSelected()
        return
      }
      transfers.queueUploadFiles({
        profileId,
        bucket: args.bucket,
        prefix: args.prefix,
        files: args.files,
        label: args.label,
        directorySelectionMode: args.directorySelectionMode,
      })
      setCreateOpen(false)
    } catch (err) {
      jobsFeedback.error(err)
    } finally {
      uploadSubmittingRef.current = false
      setDeviceUploadLoading(false)
    }
  }, [
    profileId,
    setCreateOpen,
    setDeviceUploadLoading,
    transfers,
    uploadDisabledReason,
    uploadSupported,
  ])

  const onCreateDownload = useCallback(async (args: {
    bucket: string
    prefix: string
    dirHandle: FileSystemDirectoryHandle
    label?: string
  }) => {
    if (!profileId) return
    const requestToken = beginDownloadRequest()
    setDeviceDownloadLoading(true)
    try {
      const normPrefix = normalizeJobPrefix(args.prefix)
      const items = await listAllObjects({ api, profileId, bucket: args.bucket, prefix: normPrefix })
      if (!isCurrentDownloadRequest(requestToken)) return
      if (items.length === 0) {
        jobsFeedback.noObjectsFoundUnderPrefix()
        return
      }
      if (!isCurrentDownloadRequest(requestToken)) return
      transfers.queueDownloadObjectsToDevice({
        profileId,
        bucket: args.bucket,
        items: items.map((item) => ({ key: item.key, size: item.size })),
        targetDirHandle: args.dirHandle,
        targetLabel: args.label ?? args.dirHandle.name,
        prefix: normPrefix,
      })
      if (!isCurrentDownloadRequest(requestToken)) return
      setCreateDownloadOpen(false)
    } catch (err) {
      if (!isCurrentDownloadRequest(requestToken)) return
      jobsFeedback.error(err)
    } finally {
      if (isCurrentDownloadRequest(requestToken)) {
        setDeviceDownloadLoading(false)
      }
    }
  }, [
    api,
    beginDownloadRequest,
    isCurrentDownloadRequest,
    profileId,
    transfers,
    setCreateDownloadOpen,
    setDeviceDownloadLoading,
  ])

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
    onCreateDownload,
    onCreateUpload,
  }
}
