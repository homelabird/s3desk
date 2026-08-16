import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocalStorageState } from '../../lib/useLocalStorageState'
import { legacyProfileScopedStorageKeys, profileScopedStorageKey } from '../../lib/profileScopedStorage'
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
    legacyLocalStorageKeys: legacyProfileScopedStorageKeys('jobs', apiToken, profileId, 'bucket'),
  })

  const [createDeleteOpen, setCreateDeleteOpen] = useState(() => initialDeletePrefill !== null)
  const [detailsOpen, setDetailsOpen] = useState(false)
  const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
  const [logDrawerRequest, setLogDrawerRequest] = useState<JobsLogDrawerRequestState>({ jobId: null, nonce: 0 })
  const [logClearRequest, setLogClearRequest] = useState<JobsLogClearRequestState>({ jobIds: [], nonce: 0 })
  const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => initialDeletePrefill)
  const [sortState, setSortState] = useState<SortState>(null)

  const previousScopeKeyRef = useRef<string | null | undefined>(undefined)
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
    createDeleteRequestTokenRef.current += 1
    setCreateDeleteOpen(false)
    setDeleteJobPrefill(null)
    setDetailsOpen(false)
    setDetailsJobId(null)
    setLogDrawerRequest((prev) => ({ jobId: null, nonce: prev.nonce }))
    setLogClearRequest((prev) => ({ jobIds: [], nonce: prev.nonce + 1 }))
  }, [currentScopeKey])
  /* eslint-enable react-hooks/set-state-in-effect */

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
    bucket,
    cancelDeleteRequests,
    createDeleteOpen,
    deleteJobPrefill,
    detailsJobId,
    detailsOpen,
    isCurrentDeleteRequest,
    logClearRequest,
    logDrawerRequest,
    openDeleteJobModal,
    openDetailsForJob,
    openLogsForJob,
    setBucket,
    setCreateDeleteOpen,
    setDeleteJobPrefill,
    setDetailsJobId,
    setDetailsOpen,
    setLogClearRequest,
    setLogDrawerRequest,
    setSortState,
    sortState,
  }
}
