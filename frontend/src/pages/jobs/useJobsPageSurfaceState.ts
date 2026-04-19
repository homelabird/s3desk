import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { legacyProfileScopedStorageKey, profileScopedStorageKey } from '../../lib/profileScopedStorage'
import type { DeleteJobPrefill } from './jobsPageTypes'
import type { SortState } from './JobsVirtualTable'

type UseJobsPageSurfaceStateArgs = {
  apiToken: string
  profileId: string | null
  initialDeletePrefill: DeleteJobPrefill | null
}

export type JobsLogDrawerRequestState = {
  jobId: string | null
  nonce: number
}

export type JobsLogClearRequestState = {
  jobIds: string[]
  nonce: number
}

export function useJobsPageSurfaceState({
  apiToken,
  profileId,
  initialDeletePrefill,
}: UseJobsPageSurfaceStateArgs) {
  const bucketStorageKey = useMemo(
    () => profileScopedStorageKey('jobs', apiToken, profileId, 'bucket'),
    [apiToken, profileId],
  )
  const [bucket, setBucket] = useLocalStorageState<string>(bucketStorageKey, '', {
    legacyLocalStorageKey: 'bucket',
    legacyLocalStorageKeys: [legacyProfileScopedStorageKey('jobs', profileId, 'bucket')],
  })

  const [createOpen, setCreateOpen] = useState(false)
  const [createDeleteOpen, setCreateDeleteOpen] = useState(() => initialDeletePrefill !== null)
  const [createDownloadOpen, setCreateDownloadOpen] = useState(false)
  const [deviceUploadLoading, setDeviceUploadLoading] = useState(false)
  const [deviceDownloadLoading, setDeviceDownloadLoading] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
  const [logDrawerRequest, setLogDrawerRequest] = useState<JobsLogDrawerRequestState>({ jobId: null, nonce: 0 })
  const [logClearRequest, setLogClearRequest] = useState<JobsLogClearRequestState>({ jobIds: [], nonce: 0 })
  const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => initialDeletePrefill)
  const [sortState, setSortState] = useState<SortState>(null)

  const previousScopeKeyRef = useRef<string | null | undefined>(undefined)
  const downloadRequestTokenRef = useRef(0)
  const createDeleteRequestTokenRef = useRef(0)
  const currentScopeKey = `${apiToken || '__no_server__'}:${profileId ?? '__no_profile__'}`

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (previousScopeKeyRef.current === undefined) {
      previousScopeKeyRef.current = currentScopeKey
      return
    }
    if (previousScopeKeyRef.current === currentScopeKey) return

    previousScopeKeyRef.current = currentScopeKey
    downloadRequestTokenRef.current += 1
    createDeleteRequestTokenRef.current += 1
    setCreateOpen(false)
    setCreateDeleteOpen(false)
    setCreateDownloadOpen(false)
    setDeviceUploadLoading(false)
    setDeviceDownloadLoading(false)
    setDeleteJobPrefill(null)
    setDetailsOpen(false)
    setDetailsJobId(null)
    setLogDrawerRequest((prev) => ({ jobId: null, nonce: prev.nonce }))
    setLogClearRequest((prev) => ({ jobIds: [], nonce: prev.nonce + 1 }))
  }, [currentScopeKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  const beginDownloadRequest = useCallback(() => {
    const token = downloadRequestTokenRef.current + 1
    downloadRequestTokenRef.current = token
    return token
  }, [])

  const isCurrentDownloadRequest = useCallback(
    (token: number) => downloadRequestTokenRef.current === token,
    [],
  )

  const cancelDownloadRequests = useCallback(() => {
    downloadRequestTokenRef.current += 1
    setCreateDownloadOpen(false)
    setDeviceDownloadLoading(false)
  }, [])

  const beginDeleteRequest = useCallback(() => {
    const token = createDeleteRequestTokenRef.current + 1
    createDeleteRequestTokenRef.current = token
    return token
  }, [])

  const isCurrentDeleteRequest = useCallback(
    (token: number) => createDeleteRequestTokenRef.current === token,
    [],
  )

  const cancelDeleteRequests = useCallback(() => {
    createDeleteRequestTokenRef.current += 1
    setCreateDeleteOpen(false)
    setDeleteJobPrefill(null)
  }, [])

  const openDeleteJobModal = useCallback(() => {
    setDeleteJobPrefill(null)
    setCreateDeleteOpen(true)
  }, [])

  const openDetailsForJob = useCallback((jobId: string) => {
    setDetailsJobId(jobId)
    setDetailsOpen(true)
  }, [])

  const openLogsForJob = useCallback((jobId: string) => {
    setLogDrawerRequest((prev) => ({ jobId, nonce: prev.nonce + 1 }))
  }, [])

  return {
    beginDeleteRequest,
    beginDownloadRequest,
    bucket,
    cancelDeleteRequests,
    cancelDownloadRequests,
    createDeleteOpen,
    createDownloadOpen,
    createOpen,
    deleteJobPrefill,
    detailsJobId,
    detailsOpen,
    deviceDownloadLoading,
    deviceUploadLoading,
    isCurrentDeleteRequest,
    isCurrentDownloadRequest,
    logClearRequest,
    logDrawerRequest,
    openDeleteJobModal,
    openDetailsForJob,
    openLogsForJob,
    setBucket,
    setCreateDeleteOpen,
    setCreateDownloadOpen,
    setCreateOpen,
    setDeleteJobPrefill,
    setDetailsJobId,
    setDetailsOpen,
    setLogClearRequest,
    setDeviceDownloadLoading,
    setDeviceUploadLoading,
    setLogDrawerRequest,
    setSortState,
    sortState,
  }
}
