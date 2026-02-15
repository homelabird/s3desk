import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
	Grid,
	Space,
	message,
	theme,
	type MenuProps,
} from 'antd'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
	DeleteOutlined,
	DownloadOutlined,
} from '@ant-design/icons'
import { useLocation } from 'react-router-dom'

import { APIClient } from '../api/client'
import { useTransfers } from '../components/useTransfers'
import type { Bucket, Job, JobCreateRequest, Profile } from '../api/types'
import { withJobQueueRetry } from '../lib/jobQueue'
import { collectFilesFromDirectoryHandle, normalizeRelativePath } from '../lib/deviceFs'
import { listAllObjects } from '../lib/objects'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { allJobTypes } from '../lib/jobTypes'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../lib/providerCapabilities'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { useIsOffline } from '../lib/useIsOffline'
import { SetupCallout } from '../components/SetupCallout'
import { measurePerf } from '../lib/perf'
import {
	normalizePrefix as normalizeJobPrefix,
} from './jobs/jobUtils'
import { jobSummary } from './jobs/jobPresentation'
import { useJobsActionMutations } from './jobs/useJobsActionMutations'
import { useJobsColumnsVisibility } from './jobs/useJobsColumnsVisibility'
import { JobsCreateModals } from './jobs/JobsCreateModals'
import { JobsDetailsDrawer } from './jobs/JobsDetailsDrawer'
import { useJobsFilters } from './jobs/useJobsFilters'
import { JobsLogsDrawer } from './jobs/JobsLogsDrawer'
import { JobsTableSection } from './jobs/JobsTableSection'
import { JobsToolbar } from './jobs/JobsToolbar'
import type { SortState } from './jobs/JobsVirtualTable'
import { useJobsLogsState } from './jobs/useJobsLogsState'
import { useJobsRealtimeEvents } from './jobs/useJobsRealtimeEvents'
import { useJobsTableColumns } from './jobs/useJobsTableColumns'
import { useJobsUploadDetails } from './jobs/useJobsUploadDetails'

type Props = {
	apiToken: string
	profileId: string | null
}

type DeleteJobPrefill = {
	bucket: string
	prefix: string
	deleteAll: boolean
}

export function JobsPage(props: Props) {
	const queryClient = useQueryClient()
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const location = useLocation()
	const screens = Grid.useBreakpoint()
	const { token } = theme.useToken()
	const isOffline = useIsOffline()
	const [moveAfterUploadDefault, setMoveAfterUploadDefault] = useLocalStorageState<boolean>('moveAfterUploadDefault', false)
	const [cleanupEmptyDirsDefault, setCleanupEmptyDirsDefault] = useLocalStorageState<boolean>('cleanupEmptyDirsDefault', false)

	const createJobWithRetry = useCallback(
		(req: JobCreateRequest) => {
			if (!props.profileId) throw new Error('profile is required')
			return withJobQueueRetry(() => api.createJob(props.profileId!, req))
		},
		[api, props.profileId],
	)

	const deleteJobInitialPrefill: DeleteJobPrefill | null = (() => {
		if (!location.state || typeof location.state !== 'object') return null
		const state = location.state as { openDeleteJob?: unknown; bucket?: unknown; prefix?: unknown; deleteAll?: unknown }
		if (state.openDeleteJob !== true) return null
		const bucketFromState = typeof state.bucket === 'string' ? state.bucket : ''
		if (!bucketFromState.trim()) return null
		const prefixFromState = typeof state.prefix === 'string' ? state.prefix : ''
		const deleteAllFromState = state.deleteAll === true
		return { bucket: bucketFromState, prefix: prefixFromState, deleteAll: deleteAllFromState }
	})()

	const [createOpen, setCreateOpen] = useState(false)
	const [createDeleteOpen, setCreateDeleteOpen] = useState(() => deleteJobInitialPrefill !== null)
	const [createDownloadOpen, setCreateDownloadOpen] = useState(false)
	const [deviceUploadLoading, setDeviceUploadLoading] = useState(false)
	const [deviceDownloadLoading, setDeviceDownloadLoading] = useState(false)
	const [detailsOpen, setDetailsOpen] = useState(false)
	const [detailsJobId, setDetailsJobId] = useState<string | null>(null)
	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const {
		logsOpen,
		activeLogJobId,
		logSearchQuery,
		setLogSearchQuery,
		followLogs,
		setFollowLogs,
		logsContainerRef,
		logPollFailures,
		logPollPaused,
		resumeLogPolling,
		activeLogLines,
		normalizedLogSearchQuery,
		visibleLogEntries,
		visibleLogText,
		copyVisibleLogs,
		openLogsForJob,
		closeLogs,
		refreshActiveLogs,
		isLogsLoading,
		clearLogsForJobs,
		clearLogsForJob,
	} = useJobsLogsState({
		api,
		profileId: props.profileId,
	})
	const {
		statusFilter,
		setStatusFilter,
		typeFilter,
		setTypeFilter,
		errorCodeFilter,
		setErrorCodeFilter,
		typeFilterNormalized,
		errorCodeFilterNormalized,
		filtersDirty,
		resetFilters,
	} = useJobsFilters()
	const handleJobsDeleted = useCallback(
		(jobIds: string[]) => {
			clearLogsForJobs(jobIds)
			setDetailsJobId((prev) => {
				if (!prev || !jobIds.includes(prev)) return prev
				setDetailsOpen(false)
				return null
			})
		},
		[clearLogsForJobs],
	)
	const handleJobDeleted = useCallback(
		(jobId: string) => {
			clearLogsForJob(jobId)
			setDetailsJobId((prev) => {
				if (prev !== jobId) return prev
				setDetailsOpen(false)
				return null
			})
		},
		[clearLogsForJob],
	)
	const { eventsConnected, eventsTransport, eventsRetryCount, eventsRetryThreshold, retryRealtime } = useJobsRealtimeEvents({
		apiToken: props.apiToken,
		profileId: props.profileId,
		queryClient,
		onJobsDeleted: handleJobsDeleted,
	})
	const { cancelingJobId, retryingJobId, deletingJobId, cancelMutation, retryMutation, deleteJobMutation } =
		useJobsActionMutations({
			api,
			profileId: props.profileId,
			queryClient,
			onJobDeleted: handleJobDeleted,
		})
	const [deleteJobPrefill, setDeleteJobPrefill] = useState<DeleteJobPrefill | null>(() => deleteJobInitialPrefill)
	const { mergedColumnVisibility, columnOptions, columnsDirty, setColumnVisible, resetColumns } = useJobsColumnsVisibility()
	const openDeleteJobModal = useCallback(() => {
		setDeleteJobPrefill(null)
		setCreateDeleteOpen(true)
	}, [])
	const topActionsMenu = useMemo<MenuProps>(
		() => ({
			items: [
				{
					key: 'download_folder',
					icon: <DownloadOutlined />,
					label: 'Download folder (device)',
					disabled: isOffline,
				},
				{
					key: 'new_delete_job',
					icon: <DeleteOutlined />,
					label: 'New Delete Job',
					danger: true,
					disabled: isOffline,
				},
			],
			onClick: ({ key }) => {
				if (key === 'download_folder') {
					setCreateDownloadOpen(true)
					return
				}
				if (key === 'new_delete_job') {
					openDeleteJobModal()
				}
			},
		}),
		[isOffline, openDeleteJobModal],
	)
	const tableContainerRef = useRef<HTMLDivElement | null>(null)
	const [tableScrollY, setTableScrollY] = useState(480)
	const setTableContainerElement = useCallback((element: HTMLDivElement | null) => {
		tableContainerRef.current = element
	}, [])

	const updateTableScroll = useCallback(() => {
		const el = tableContainerRef.current
		if (!el) return
		const rect = el.getBoundingClientRect()
		const padding = 24
		const next = Math.max(240, Math.floor(window.innerHeight - rect.top - padding))
		setTableScrollY(next)
	}, [])

	useLayoutEffect(() => {
		updateTableScroll()
		window.addEventListener('resize', updateTableScroll)
		return () => window.removeEventListener('resize', updateTableScroll)
	}, [updateTableScroll])

	const metaQuery = useQuery({
		queryKey: ['meta', props.apiToken],
		queryFn: () => api.getMeta(),
		enabled: !!props.apiToken,
	})
	const profilesQuery = useQuery({
		queryKey: ['profiles', props.apiToken],
		queryFn: () => api.listProfiles(),
		enabled: !!props.apiToken,
	})
	const selectedProfile: Profile | null = useMemo(() => {
		if (!props.profileId) return null
		return profilesQuery.data?.find((profile) => profile.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers)
		: null
	const uploadSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadDisabledReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})
	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))
	const {
		jobDetailsQuery,
		uploadDetails,
		uploadRootLabel,
		uploadTablePageItems,
		uploadTableDataLength,
		uploadTablePageSize,
		uploadTablePageSafe,
		uploadTableTotalPages,
		goToPrevUploadTablePage,
		goToNextUploadTablePage,
		uploadHashesLoading,
		uploadHashFailures,
	} = useJobsUploadDetails({
		api,
		profileId: props.profileId,
		apiToken: props.apiToken,
		detailsJobId,
		detailsOpen,
	})

	const jobsQuery = useInfiniteQuery({
		queryKey: ['jobs', props.profileId, props.apiToken, statusFilter, typeFilterNormalized, errorCodeFilterNormalized],
		enabled: !!props.profileId,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) =>
			api.listJobs(props.profileId!, {
				limit: 50,
				status: statusFilter === 'all' ? undefined : statusFilter,
				type: typeFilter.trim() ? typeFilter.trim() : undefined,
				errorCode: errorCodeFilter.trim() ? errorCodeFilter.trim() : undefined,
				cursor: pageParam,
			}),
		getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
		refetchInterval: eventsConnected ? false : 5000,
	})

	const handleDeviceUpload = useCallback(
		async (args: {
			bucket: string
			prefix: string
			dirHandle: FileSystemDirectoryHandle
			label?: string
			moveAfterUpload?: boolean
			cleanupEmptyDirs?: boolean
		}) => {
			if (!props.profileId) return
			if (!uploadSupported) {
				message.warning(uploadDisabledReason ?? 'Uploads are not supported by this provider.')
				return
			}
			setDeviceUploadLoading(true)
			try {
				const files = await collectFilesFromDirectoryHandle(args.dirHandle)
				if (files.length === 0) {
					message.info('No files found in the selected folder')
					return
				}
				const relPaths = files
					.map((file) => {
						const fileWithPath = file as File & { relativePath?: string; webkitRelativePath?: string }
						const relPath = (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim()
						return normalizeRelativePath(relPath || file.name)
					})
					.filter(Boolean)
				transfers.queueUploadFiles({
					profileId: props.profileId,
					bucket: args.bucket,
					prefix: args.prefix,
					files,
					label: args.label,
					moveSource: args.moveAfterUpload
						? {
								rootHandle: args.dirHandle,
								relPaths,
								label: args.label ?? args.dirHandle.name,
								cleanupEmptyDirs: args.cleanupEmptyDirs,
							}
						: undefined,
				})
				setCreateOpen(false)
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setDeviceUploadLoading(false)
			}
		},
		[props.profileId, transfers, uploadDisabledReason, uploadSupported],
	)

	const handleDeviceDownload = useCallback(
		async (args: { bucket: string; prefix: string; dirHandle: FileSystemDirectoryHandle; label?: string }) => {
			if (!props.profileId) return
			setDeviceDownloadLoading(true)
			try {
				const normPrefix = normalizeJobPrefix(args.prefix)
				const items = await listAllObjects({
					api,
					profileId: props.profileId,
					bucket: args.bucket,
					prefix: normPrefix,
				})
				if (items.length === 0) {
					message.info('No objects found under this prefix')
					return
				}
				transfers.queueDownloadObjectsToDevice({
					profileId: props.profileId,
					bucket: args.bucket,
					items: items.map((item) => ({ key: item.key, size: item.size })),
					targetDirHandle: args.dirHandle,
					targetLabel: args.label ?? args.dirHandle.name,
					prefix: normPrefix,
				})
				setCreateDownloadOpen(false)
			} catch (err) {
				message.error(formatErr(err))
			} finally {
				setDeviceDownloadLoading(false)
			}
		},
		[api, props.profileId, transfers],
	)

	const createDeleteMutation = useMutation({
		mutationFn: (payload: {
			bucket: string
			prefix: string
			deleteAll: boolean
			allowUnsafePrefix: boolean
			include: string[]
			exclude: string[]
			dryRun: boolean
		}) => createJobWithRetry({ type: 'transfer_delete_prefix', payload }),
		onSuccess: async (job) => {
			message.success(`Delete job created: ${job.id}`)
			setCreateDeleteOpen(false)
			setDeleteJobPrefill(null)
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const jobs = useMemo(
		() =>
			measurePerf('Jobs.flatten', () => jobsQuery.data?.pages.flatMap((p) => p.items) ?? [], {
				pages: jobsQuery.data?.pages.length ?? 0,
			}),
		[jobsQuery.data],
	)
	const errorCodeSuggestions = useMemo(() => {
		const uniq = new Set<string>()
		for (const j of jobs) {
			if (j.errorCode) uniq.add(j.errorCode)
		}
		return Array.from(uniq)
			.sort()
			.map((value) => ({ value }))
	}, [jobs])
	const typeFilterSuggestions = useMemo(() => {
		const seen = new Set<string>()
		const out: Array<{ value: string; label?: string }> = []
		for (const t of allJobTypes) {
			seen.add(t.type)
			out.push({ value: t.type, label: t.label })
		}
		for (const j of jobs) {
			if (!j.type) continue
			if (seen.has(j.type)) continue
			seen.add(j.type)
			out.push({ value: j.type, label: j.type })
		}
		return out
	}, [jobs])
	const isLoading = jobsQuery.isFetching && !jobsQuery.isFetchingNextPage
	useEffect(() => {
		updateTableScroll()
	}, [updateTableScroll, bucketsQuery.isError, eventsConnected, eventsRetryCount, jobs.length, jobsQuery.isError])
	const jobSummaryById = useMemo(() => {
		const next = new Map<string, string | null>()
		for (const job of jobs) {
			next.set(job.id, jobSummary(job))
		}
		return next
	}, [jobs])
	const getJobSummary = useCallback((job: Job) => jobSummaryById.get(job.id) ?? null, [jobSummaryById])
	const openDetailsForJob = useCallback((jobId: string) => {
		setDetailsJobId(jobId)
		setDetailsOpen(true)
	}, [])
	const requestCancelJob = useCallback((jobId: string) => {
		cancelMutation.mutate(jobId)
	}, [cancelMutation])
	const requestRetryJob = useCallback((jobId: string) => {
		retryMutation.mutate(jobId)
	}, [retryMutation])
	const requestDeleteJob = useCallback(async (jobId: string) => {
		await deleteJobMutation.mutateAsync(jobId)
	}, [deleteJobMutation])
	const setLogsContainerElement = useCallback(
		(element: HTMLDivElement | null) => {
			logsContainerRef.current = element
		},
		[logsContainerRef],
	)
	const columns = useJobsTableColumns({
		mergedColumnVisibility,
		isOffline,
		isLogsLoading,
		activeLogJobId,
		cancelingJobId,
		retryingJobId,
		deletingJobId,
		cancelPending: cancelMutation.isPending,
		retryPending: retryMutation.isPending,
		deletePending: deleteJobMutation.isPending,
		profileId: props.profileId,
		getJobSummary,
		openDetailsForJob,
		openLogsForJob,
		requestCancelJob,
		requestRetryJob,
		requestDeleteJob,
		queueDownloadJobArtifact: transfers.queueDownloadJobArtifact,
	})

	const [sortState, setSortState] = useState<SortState>(null)
	useEffect(() => {
		if (!sortState) return
		const column = columns.find((c) => c.key === sortState.key)
		if (!column || !column.sorter) setSortState(null)
	}, [columns, sortState])

	const sortedJobs = useMemo(() => {
		if (!sortState) return jobs
		const column = columns.find((c) => c.key === sortState.key)
		const sorter = column?.sorter
		if (!sorter) return jobs
		const next = [...jobs].sort(sorter)
		if (sortState.direction === 'desc') next.reverse()
		return next
	}, [columns, jobs, sortState])

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to view jobs" />
	}

	return (
		<Space orientation="vertical" size="large" style={{ width: '100%' }}>
			<JobsToolbar
				isOffline={isOffline}
				uploadSupported={uploadSupported}
				uploadDisabledReason={uploadDisabledReason}
				eventsConnected={eventsConnected}
				eventsTransport={eventsTransport}
				eventsRetryCount={eventsRetryCount}
				eventsRetryThreshold={eventsRetryThreshold}
				onRetryRealtime={retryRealtime}
				onOpenCreateUpload={() => setCreateOpen(true)}
				topActionsMenu={topActionsMenu}
				statusFilter={statusFilter}
				onStatusFilterChange={setStatusFilter}
				typeFilterNormalized={typeFilterNormalized}
				onTypeFilterChange={setTypeFilter}
				typeFilterSuggestions={typeFilterSuggestions}
				errorCodeFilterNormalized={errorCodeFilterNormalized}
				onErrorCodeFilterChange={setErrorCodeFilter}
				errorCodeSuggestions={errorCodeSuggestions}
				filtersDirty={filtersDirty}
				onResetFilters={resetFilters}
				columnOptions={columnOptions}
				mergedColumnVisibility={mergedColumnVisibility}
				onSetColumnVisible={setColumnVisible}
				columnsDirty={columnsDirty}
				onResetColumns={resetColumns}
				onRefreshJobs={() => {
					void jobsQuery.refetch()
				}}
				jobsRefreshing={jobsQuery.isFetching}
				jobsCount={jobs.length}
				isMdScreen={!!screens.md}
				dropdownBg={token.colorBgElevated}
				dropdownBorder={token.colorBorderSecondary}
				dropdownBorderRadius={token.borderRadiusLG}
				dropdownShadow={token.boxShadowSecondary}
			/>

			<JobsTableSection
				bucketsError={bucketsQuery.isError ? bucketsQuery.error : null}
				jobsError={jobsQuery.isError ? jobsQuery.error : null}
				sortedJobs={sortedJobs}
				columns={columns}
				tableScrollY={tableScrollY}
				isLoading={isLoading}
				isOffline={isOffline}
				uploadSupported={uploadSupported}
				onOpenCreateUpload={() => setCreateOpen(true)}
				onOpenDeleteJob={openDeleteJobModal}
				sortState={sortState}
				onSortChange={setSortState}
				theme={{
					borderColor: token.colorBorderSecondary,
					bg: token.colorBgContainer,
					hoverBg: token.colorFillAlter,
				}}
				hasNextPage={jobsQuery.hasNextPage ?? false}
				onLoadMore={() => {
					void jobsQuery.fetchNextPage()
				}}
				isFetchingNextPage={jobsQuery.isFetchingNextPage}
				onTableContainerRef={setTableContainerElement}
			/>

			<JobsCreateModals
				profileId={props.profileId}
				createOpen={createOpen}
				createDownloadOpen={createDownloadOpen}
				createDeleteOpen={createDeleteOpen}
				onCloseCreate={() => setCreateOpen(false)}
				onCloseDownload={() => setCreateDownloadOpen(false)}
				onCloseDelete={() => {
					setCreateDeleteOpen(false)
					setDeleteJobPrefill(null)
				}}
				onSubmitCreate={(values) => {
					void handleDeviceUpload(values)
				}}
				onSubmitDownload={(values) => {
					void handleDeviceDownload(values)
				}}
				onSubmitDelete={(values) => createDeleteMutation.mutate(values)}
				uploadLoading={deviceUploadLoading}
				downloadLoading={deviceDownloadLoading}
				deleteLoading={createDeleteMutation.isPending}
				isOffline={isOffline}
				uploadSupported={uploadSupported}
				uploadUnsupportedReason={uploadDisabledReason ?? null}
				bucket={bucket}
				onBucketChange={setBucket}
				bucketOptions={bucketOptions}
				defaultMoveAfterUpload={moveAfterUploadDefault}
				defaultCleanupEmptyDirs={cleanupEmptyDirsDefault}
				onUploadDefaultsChange={(values) => {
					setMoveAfterUploadDefault(values.moveAfterUpload)
					setCleanupEmptyDirsDefault(values.cleanupEmptyDirs)
				}}
				deleteBucket={deleteJobPrefill?.bucket ?? bucket}
				deletePrefill={deleteJobPrefill ? { prefix: deleteJobPrefill.prefix, deleteAll: deleteJobPrefill.deleteAll } : null}
			/>

				<JobsDetailsDrawer
					open={detailsOpen}
					onClose={() => setDetailsOpen(false)}
					width={screens.md ? 720 : '100%'}
					isOffline={isOffline}
					detailsJobId={detailsJobId}
					job={jobDetailsQuery.data}
					isFetching={jobDetailsQuery.isFetching}
					isError={jobDetailsQuery.isError}
					error={jobDetailsQuery.error}
					onRefresh={() => {
						void jobDetailsQuery.refetch()
					}}
					onDeleteJob={(jobId) => deleteJobMutation.mutateAsync(jobId)}
					deleteLoading={deleteJobMutation.isPending && deletingJobId === detailsJobId}
					onOpenLogs={(jobId) => {
						setDetailsOpen(false)
						openLogsForJob(jobId)
					}}
					uploadDetails={uploadDetails}
					uploadRootLabel={uploadRootLabel}
					uploadTablePageItems={uploadTablePageItems}
					uploadTableDataLength={uploadTableDataLength}
					uploadTablePageSize={uploadTablePageSize}
					uploadTablePageSafe={uploadTablePageSafe}
					uploadTableTotalPages={uploadTableTotalPages}
					onUploadTablePrevPage={goToPrevUploadTablePage}
					onUploadTableNextPage={goToNextUploadTablePage}
					uploadHashesLoading={uploadHashesLoading}
					uploadHashFailures={uploadHashFailures}
					borderColor={token.colorBorderSecondary}
					backgroundColor={token.colorBgContainer}
					borderRadius={token.borderRadiusLG}
				/>

				<JobsLogsDrawer
					open={logsOpen}
					onClose={closeLogs}
					width={screens.md ? 720 : '100%'}
					activeLogJobId={activeLogJobId}
					isLogsLoading={isLogsLoading}
					onRefresh={refreshActiveLogs}
					followLogs={followLogs}
					onFollowLogsChange={setFollowLogs}
					logPollPaused={logPollPaused}
					logPollFailures={logPollFailures}
					onResumeLogPolling={resumeLogPolling}
					logSearchQuery={logSearchQuery}
					onLogSearchQueryChange={setLogSearchQuery}
					onCopyVisibleLogs={copyVisibleLogs}
					normalizedLogSearchQuery={normalizedLogSearchQuery}
					visibleLogEntries={visibleLogEntries}
					activeLogLines={activeLogLines}
					onLogsContainerRef={setLogsContainerElement}
					visibleLogText={visibleLogText}
					searchInputWidth={screens.sm ? 320 : '100%'}
				/>
			</Space>
		)
}
