import { useCallback, useEffect, useRef, useState } from 'react'

import type { APIClient } from '../api/client'
import type { ServerStagedRestore } from '../api/types'
import { formatErrorWithHint as formatErr } from '../lib/errors'

const STALE_RESTORE_CUTOFF_MS = 7 * 24 * 60 * 60 * 1000

export function useRestoreStaging(args: {
	api: APIClient
	open: boolean
	metaLoaded: boolean
	onRestoreDeleted?: (restoreId: string) => void
}) {
	const { api, open, metaLoaded, onRestoreDeleted } = args
	const [stagedRestores, setStagedRestores] = useState<ServerStagedRestore[]>([])
	const [stagedRestoresLoading, setStagedRestoresLoading] = useState(false)
	const [stagedRestoresError, setStagedRestoresError] = useState<string | null>(null)
	const [deleteRestoreId, setDeleteRestoreId] = useState<string | null>(null)
	const [cleanupRestoresLoading, setCleanupRestoresLoading] = useState(false)
	const stagedRestoresRequestTokenRef = useRef(0)
	const deleteRestoreRequestTokenRef = useRef(0)
	const cleanupRestoresRequestTokenRef = useRef(0)

	const refreshStagedRestores = useCallback(async () => {
		const requestToken = stagedRestoresRequestTokenRef.current + 1
		stagedRestoresRequestTokenRef.current = requestToken
		setStagedRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			const result = await api.server.listServerRestores()
			if (stagedRestoresRequestTokenRef.current !== requestToken) return
			setStagedRestores(result.items ?? [])
		} catch (err) {
			if (stagedRestoresRequestTokenRef.current !== requestToken) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (stagedRestoresRequestTokenRef.current === requestToken) {
				setStagedRestoresLoading(false)
			}
		}
	}, [api])

	useEffect(() => {
		if (!open || !metaLoaded) return
		void refreshStagedRestores()
	}, [metaLoaded, open, refreshStagedRestores])

	const isRestoreStale = useCallback((stagedAt: string) => {
		const time = Date.parse(stagedAt)
		return Number.isFinite(time) && Date.now() - time >= STALE_RESTORE_CUTOFF_MS
	}, [])

	const formatRestoreAge = useCallback((stagedAt: string) => {
		const time = Date.parse(stagedAt)
		if (!Number.isFinite(time)) return stagedAt
		const deltaMs = Date.now() - time
		if (deltaMs < 60_000) return 'just now'
		const deltaMinutes = Math.floor(deltaMs / 60_000)
		if (deltaMinutes < 60) return `${deltaMinutes}m ago`
		const deltaHours = Math.floor(deltaMinutes / 60)
		if (deltaHours < 48) return `${deltaHours}h ago`
		return `${Math.floor(deltaHours / 24)}d ago`
	}, [])

	const handleDeleteRestore = useCallback(async (restoreId: string) => {
		const requestToken = deleteRestoreRequestTokenRef.current + 1
		deleteRestoreRequestTokenRef.current = requestToken
		setDeleteRestoreId(restoreId)
		setStagedRestoresError(null)
		try {
			await api.server.deleteServerRestore(restoreId)
			if (deleteRestoreRequestTokenRef.current !== requestToken) return
			onRestoreDeleted?.(restoreId)
			await refreshStagedRestores()
		} catch (err) {
			if (deleteRestoreRequestTokenRef.current !== requestToken) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (deleteRestoreRequestTokenRef.current === requestToken) {
				setDeleteRestoreId((current) => (current === restoreId ? null : current))
			}
		}
	}, [api, onRestoreDeleted, refreshStagedRestores])

	const handleDeleteStaleRestores = useCallback(async () => {
		const staleIds = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).map((item) => item.id)
		if (staleIds.length === 0) return
		const requestToken = cleanupRestoresRequestTokenRef.current + 1
		cleanupRestoresRequestTokenRef.current = requestToken
		setCleanupRestoresLoading(true)
		setStagedRestoresError(null)
		try {
			await Promise.all(staleIds.map((restoreId) => api.server.deleteServerRestore(restoreId)))
			if (cleanupRestoresRequestTokenRef.current !== requestToken) return
			onRestoreDeleted?.('__stale_cleanup__')
			await refreshStagedRestores()
		} catch (err) {
			if (cleanupRestoresRequestTokenRef.current !== requestToken) return
			setStagedRestoresError(formatErr(err))
		} finally {
			if (cleanupRestoresRequestTokenRef.current === requestToken) {
				setCleanupRestoresLoading(false)
			}
		}
	}, [api, isRestoreStale, onRestoreDeleted, refreshStagedRestores, stagedRestores])

	const resetRestoreInventoryState = useCallback(() => {
		stagedRestoresRequestTokenRef.current += 1
		deleteRestoreRequestTokenRef.current += 1
		cleanupRestoresRequestTokenRef.current += 1
		setStagedRestoresLoading(false)
		setDeleteRestoreId(null)
		setCleanupRestoresLoading(false)
	}, [])

	return {
		stagedRestores,
		stagedRestoresLoading,
		stagedRestoresError,
		deleteRestoreId,
		cleanupRestoresLoading,
		refreshStagedRestores,
		handleDeleteRestore,
		handleDeleteStaleRestores,
		isRestoreStale,
		formatRestoreAge,
		resetRestoreInventoryState,
	}
}
