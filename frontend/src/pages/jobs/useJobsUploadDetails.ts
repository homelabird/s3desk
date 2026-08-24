import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { APIClientShape } from '../../api/client'
import { queryKeys } from '../../api/queryKeys'
import { findCachedListJob, getBool, getNumber, getString, joinKeyWithPrefix } from './jobUtils'
import type { JobsUploadDetailItem, JobsUploadDetails, JobsUploadTableRow } from './jobsUploadTypes'

type UseJobsUploadDetailsArgs = {
	api: APIClientShape
	profileId: string | null
	apiToken: string
	detailsJobId: string | null
	detailsOpen: boolean
	uploadTablePageSize?: number
}

type UploadEtagsQueryData = {
	etags: Record<string, string | null>
	failures: number
}

function supportsUploadDetailsJobType(type: string | undefined): boolean {
	return type === 'transfer_sync_staging_to_s3' || type === 'transfer_direct_upload'
}

export function useJobsUploadDetails({
	api,
	profileId,
	apiToken,
	detailsJobId,
	detailsOpen,
	uploadTablePageSize = 20,
}: UseJobsUploadDetailsArgs) {
	const queryClient = useQueryClient()
	const cachedListJob = useMemo(
		() =>
			detailsOpen && profileId && detailsJobId
				? findCachedListJob(queryClient, queryKeys.jobs.scope(profileId, apiToken), detailsJobId)
				: null,
		[apiToken, detailsJobId, detailsOpen, profileId, queryClient],
	)
	const jobDetailsQuery = useQuery({
		queryKey: queryKeys.jobs.detail(profileId, detailsJobId, apiToken),
		queryFn: () => api.jobs.getJob(profileId!, detailsJobId!),
		enabled: !!profileId && !!detailsJobId && detailsOpen,
		initialData: cachedListJob?.job,
		initialDataUpdatedAt: cachedListJob?.dataUpdatedAt,
	})

	const uploadDetails = useMemo<JobsUploadDetails | null>(() => {
		const job = jobDetailsQuery.data
		if (!job || !supportsUploadDetailsJobType(job.type)) return null
		if (!job.payload || typeof job.payload !== 'object') return null

		const payload = job.payload as Record<string, unknown>
		const prefix = typeof payload['prefix'] === 'string' ? payload['prefix'].trim() : ''
		const rootKindRaw = getString(payload, 'rootKind')
		const rootKind =
			rootKindRaw === 'file' || rootKindRaw === 'folder' || rootKindRaw === 'collection' ? rootKindRaw : undefined
		const itemsRaw = Array.isArray(payload['items']) ? payload['items'] : []
		const items: JobsUploadDetailItem[] = []

		for (const raw of itemsRaw) {
			if (!raw || typeof raw !== 'object') continue
			const item = raw as Record<string, unknown>
			const path = getString(item, 'path')
			const key = getString(item, 'key') ?? (path ? joinKeyWithPrefix(prefix, path) : null)
			if (!path && !key) continue

			const size = getNumber(item, 'size')
			const etag = typeof item['etag'] === 'string' ? item['etag'].trim() : undefined
			const resolvedKey = key ?? (path ? joinKeyWithPrefix(prefix, path) : '')
			const resolvedPath = path ?? resolvedKey
			if (!resolvedKey || !resolvedPath) continue

			items.push({
				path: resolvedPath,
				key: resolvedKey,
				size: size ?? undefined,
				etag,
			})
		}

		const totalFiles = getNumber(payload, 'totalFiles')
		const totalBytes = getNumber(payload, 'totalBytes')

		return {
			uploadId: getString(payload, 'uploadId') ?? undefined,
			bucket: getString(payload, 'bucket') ?? undefined,
			prefix,
			label: getString(payload, 'label') ?? undefined,
			rootName: getString(payload, 'rootName') ?? undefined,
			rootKind,
			totalFiles: totalFiles ?? (items.length ? items.length : undefined),
			totalBytes: totalBytes ?? undefined,
			items,
			itemsTruncated: getBool(payload, 'itemsTruncated') || undefined,
		}
	}, [jobDetailsQuery.data])

	const uploadTableScopeKey = useMemo(
		() =>
			JSON.stringify([
				detailsOpen ? detailsJobId : null,
				uploadDetails?.bucket ?? null,
				uploadDetails?.items.map((item) => item.key) ?? [],
			]),
		[detailsJobId, detailsOpen, uploadDetails],
	)
	const [uploadTablePageState, setUploadTablePageState] = useState({ scopeKey: uploadTableScopeKey, page: 1 })
	const uploadTablePage = uploadTablePageState.scopeKey === uploadTableScopeKey ? uploadTablePageState.page : 1
	useEffect(() => {
		if (uploadTablePageState.scopeKey === uploadTableScopeKey) return
		setUploadTablePageState({ scopeKey: uploadTableScopeKey, page: 1 })
	}, [uploadTablePageState.scopeKey, uploadTableScopeKey])

	const uploadTableDataLength = uploadDetails?.items.length ?? 0
	const uploadTableTotalPages = Math.max(1, Math.ceil(uploadTableDataLength / uploadTablePageSize))
	const uploadTablePageSafe = Math.min(uploadTablePage, uploadTableTotalPages)
	const uploadTablePageStart = (uploadTablePageSafe - 1) * uploadTablePageSize
	const uploadTablePageEntries = uploadDetails?.items.slice(uploadTablePageStart, uploadTablePageStart + uploadTablePageSize) ?? []
	const uploadTablePageFetchEntries = uploadTablePageEntries.filter((item) => item.etag === undefined)
	const uploadTablePageKey = JSON.stringify([detailsOpen ? detailsJobId : null, uploadTablePageEntries.map((item) => [item.key, item.etag ?? null])])

	const uploadEtagsQuery = useQuery({
		queryKey: queryKeys.jobs.uploadEtags(profileId, uploadDetails?.bucket ?? '', uploadTablePageKey, apiToken),
		enabled:
			!!profileId &&
			!!uploadDetails?.bucket &&
			uploadTablePageFetchEntries.length > 0 &&
			detailsOpen &&
			jobDetailsQuery.data?.status === 'succeeded',
		queryFn: async ({ signal }): Promise<UploadEtagsQueryData> => {
			if (!profileId || !uploadDetails?.bucket) return { etags: {}, failures: 0 }

			const results = await Promise.allSettled(
				uploadTablePageFetchEntries.map((item) =>
					api.objects.getObjectMeta({
						profileId,
						bucket: uploadDetails.bucket!,
						key: item.key,
						signal,
					}),
				),
			)

			const etags: Record<string, string | null> = {}
			let failures = 0

			results.forEach((result, index) => {
				const key = uploadTablePageFetchEntries[index]?.key
				if (!key) return
				if (result.status === 'fulfilled') {
					etags[key] = result.value.etag ?? null
					return
				}
				failures++
				etags[key] = null
			})

			return { etags, failures }
		},
	})

	const uploadEtags = uploadEtagsQuery.data?.etags ?? {}
	const uploadRootPrefix =
		uploadDetails?.rootKind === 'folder' && uploadDetails.rootName ? `${uploadDetails.rootName}/` : null
	const uploadTablePageItems: JobsUploadTableRow[] = uploadTablePageEntries.map((item) => ({
		key: item.key,
		path: uploadRootPrefix && item.path.startsWith(uploadRootPrefix) ? item.path.slice(uploadRootPrefix.length) : item.path,
		size: item.size,
		etag: item.etag !== undefined ? item.etag : uploadEtags[item.key],
	}))

	const uploadRootLabel = useMemo(() => {
		if (!uploadDetails) return null
		if (uploadDetails.rootKind && uploadDetails.rootName) return `${uploadDetails.rootKind} ${uploadDetails.rootName}`
		if (uploadDetails.rootName) return uploadDetails.rootName
		if (uploadDetails.rootKind === 'collection') return 'collection'
		return null
	}, [uploadDetails])

	const goToPrevUploadTablePage = useCallback(() => {
		setUploadTablePageState((prev) => ({
			scopeKey: uploadTableScopeKey,
			page: Math.max(1, (prev.scopeKey === uploadTableScopeKey ? prev.page : 1) - 1),
		}))
	}, [uploadTableScopeKey])

	const goToNextUploadTablePage = useCallback(() => {
		setUploadTablePageState((prev) => ({
			scopeKey: uploadTableScopeKey,
			page: Math.min(uploadTableTotalPages, (prev.scopeKey === uploadTableScopeKey ? prev.page : 1) + 1),
		}))
	}, [uploadTableScopeKey, uploadTableTotalPages])

	return {
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
		uploadHashesLoading: uploadEtagsQuery.isFetching,
		uploadHashFailures: uploadEtagsQuery.data?.failures ?? 0,
	}
}
