import { useMutation, type QueryClient } from '@tanstack/react-query'
import { message } from 'antd'
import { useCallback } from 'react'

import { queryKeys } from '../../api/queryKeys'
import type { APIClient } from '../../api/client'
import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { listAllObjects } from '../../lib/objects'
import type { DeleteJobPrefill } from './jobsPageTypes'
import { normalizePrefix as normalizeJobPrefix } from './jobUtils'

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
  api: APIClient
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
  const onCreateUpload = useCallback(async (args: {
    bucket: string
    prefix: string
    files: File[]
    label?: string
    directorySelectionMode?: 'picker' | 'input'
  }) => {
    if (!profileId) return
    if (!uploadSupported) {
      message.warning(uploadDisabledReason ?? 'Uploads are not supported by this provider.')
      return
    }
    setDeviceUploadLoading(true)
    try {
      if (args.files.length === 0) {
        message.info('No files selected')
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
      message.error(formatErr(err))
    } finally {
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
        message.info('No objects found under this prefix')
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
      message.error(formatErr(err))
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
        message.success(`Delete job created: ${job.id}`)
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
      message.error(formatErr(err))
    },
  })

  const onCreateDelete = useCallback((values: DeletePrefixJobPayload) => {
    createDeleteMutation.mutate(values)
  }, [createDeleteMutation])

  return {
    createDeleteMutation,
    onCreateDelete,
    onCreateDownload,
    onCreateUpload,
  }
}
