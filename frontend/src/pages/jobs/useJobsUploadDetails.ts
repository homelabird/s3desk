import { useQuery } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'

import type { APIClient } from '../../api/client'
import { getBool, getNumber, getString, joinKeyWithPrefix } from './jobUtils'
import type { JobsUploadDetailItem, JobsUploadDetails, JobsUploadTableRow } from './jobsUploadTypes'

type UseJobsUploadDetailsArgs = {
	api: APIClient
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

export function useJobsUploadDetails({
	api,
	profileId,
	apiToken,
	detailsJobId,
	detailsOpen,
	uploadTablePageSize = 20,
}: UseJobsUploadDetailsArgs) {
	const jobDetailsQuery = useQuery({
		queryKey: ['job', profileId, detailsJobId, apiToken],
		queryFn: () => api.getJob(profileId!, detailsJobId!),
		enabled: !!profileId && !!detailsJobId && detailsOpen,
	})

	const uploadDetails = useMemo<JobsUploadDetails | null>(() => {
		const job = jobDetailsQuery.data
		if (!job || job.type !== 'transfer_sync_staging_to_s3') return null
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
			const resolvedKey = key ?? (path ? joinKeyWithPrefix(prefix, path) : '')
			const resolvedPath = path ?? resolvedKey
			if (!resolvedKey || !resolvedPath) continue

			items.push({
				path: resolvedPath,
				key: resolvedKey,
				size: size ?? undefined,
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

	const uploadItemsKey = useMemo(() => {
		if (!uploadDetails || uploadDetails.items.length === 0) return ''
		return uploadDetails.items.map((item) => item.key).join('|')
	}, [uploadDetails])

	const uploadEtagsQuery = useQuery({
		queryKey: ['upload-etags', profileId, uploadDetails?.bucket ?? '', uploadItemsKey],
		enabled:
			!!profileId &&
			!!uploadDetails?.bucket &&
			uploadDetails.items.length > 0 &&
			detailsOpen &&
			jobDetailsQuery.data?.status === 'succeeded',
		queryFn: async (): Promise<UploadEtagsQueryData> => {
			if (!profileId || !uploadDetails?.bucket) return { etags: {}, failures: 0 }

			const entries = uploadDetails.items
			const results = await Promise.allSettled(
				entries.map((item) =>
					api.getObjectMeta({
						profileId,
						bucket: uploadDetails.bucket!,
						key: item.key,
					}),
				),
			)

			const etags: Record<string, string | null> = {}
			let failures = 0

			results.forEach((result, index) => {
				const key = entries[index]?.key
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

	const uploadTableData = useMemo<JobsUploadTableRow[]>(() => {
		if (!uploadDetails) return []
		const etags = uploadEtagsQuery.data?.etags ?? {}
		const rootPrefix =
			uploadDetails.rootKind === 'folder' && uploadDetails.rootName ? `${uploadDetails.rootName}/` : null
		return uploadDetails.items.map((item) => ({
			key: item.key,
			path: rootPrefix && item.path.startsWith(rootPrefix) ? item.path.slice(rootPrefix.length) : item.path,
			size: item.size,
			etag: etags[item.key] ?? null,
		}))
	}, [uploadDetails, uploadEtagsQuery.data])

	const [uploadTablePage, setUploadTablePage] = useState(1)
	useEffect(() => {
		setUploadTablePage(1)
	}, [uploadItemsKey])

	const uploadTableTotalPages = Math.max(1, Math.ceil(uploadTableData.length / uploadTablePageSize))
	const uploadTablePageSafe = Math.min(uploadTablePage, uploadTableTotalPages)
	const uploadTablePageStart = (uploadTablePageSafe - 1) * uploadTablePageSize
	const uploadTablePageItems = uploadTableData.slice(uploadTablePageStart, uploadTablePageStart + uploadTablePageSize)

	const uploadRootLabel = useMemo(() => {
		if (!uploadDetails) return null
		if (uploadDetails.rootKind && uploadDetails.rootName) return `${uploadDetails.rootKind} ${uploadDetails.rootName}`
		if (uploadDetails.rootName) return uploadDetails.rootName
		if (uploadDetails.rootKind === 'collection') return 'collection'
		return null
	}, [uploadDetails])

	const goToPrevUploadTablePage = useCallback(() => {
		setUploadTablePage((prev) => Math.max(1, prev - 1))
	}, [])

	const goToNextUploadTablePage = useCallback(() => {
		setUploadTablePage((prev) => Math.min(uploadTableTotalPages, prev + 1))
	}, [uploadTableTotalPages])

	return {
		jobDetailsQuery,
		uploadDetails,
		uploadRootLabel,
		uploadTablePageItems,
		uploadTableDataLength: uploadTableData.length,
		uploadTablePageSize,
		uploadTablePageSafe,
		uploadTableTotalPages,
		goToPrevUploadTablePage,
		goToNextUploadTablePage,
		uploadHashesLoading: uploadEtagsQuery.isFetching,
		uploadHashFailures: uploadEtagsQuery.data?.failures ?? 0,
	}
}
