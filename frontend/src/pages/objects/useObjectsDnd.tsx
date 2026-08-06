import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'

import type { Job, JobCreateRequest } from '../../api/types'
import { normalizePrefix } from './objectsListUtils'
import { hasInternalObjectsDndPayload, OBJECTS_DND_MIME, resolveObjectsDropIntent } from './objectsDropIntent'
import type { ObjectsDndPayload } from './objectsDndRuntime'

const parseDndPayload = (dt: DataTransfer): ObjectsDndPayload | null => {
	const raw = dt.getData(OBJECTS_DND_MIME)
	if (!raw) return null
	try {
		const parsed: unknown = JSON.parse(raw)
		if (!parsed || typeof parsed !== 'object') return null
		const rec = parsed as Record<string, unknown>

		const kind = typeof rec['kind'] === 'string' ? rec['kind'] : ''
		const bucketVal = typeof rec['bucket'] === 'string' ? rec['bucket'] : ''
		if (!bucketVal) return null

		if (kind === 'objects') {
			const keysRaw = rec['keys']
			const keys = Array.isArray(keysRaw) ? keysRaw.map(String).filter(Boolean) : []
			if (keys.length < 1) return null
			return { kind: 'objects', bucket: bucketVal, keys }
		}
		if (kind === 'prefix') {
			const prefixVal = typeof rec['prefix'] === 'string' ? rec['prefix'] : ''
			if (!prefixVal) return null
			return { kind: 'prefix', bucket: bucketVal, prefix: prefixVal }
		}
		return null
	} catch {
		return null
	}
}

const dropModeFromEvent = (e: React.DragEvent): 'copy' | 'move' => {
	const isCopy = e.ctrlKey || e.metaKey || e.altKey
	return isCopy ? 'copy' : 'move'
}

type UseObjectsDndArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	canDragDrop: boolean
	isDesktop: boolean
	selectedKeys: Set<string>
	setSelectedKeys: React.Dispatch<React.SetStateAction<Set<string>>>
	setLastSelectedObjectKey: React.Dispatch<React.SetStateAction<string | null>>
	createJobWithRetry: (req: JobCreateRequest) => Promise<Job>
	queryClient: QueryClient
}

export function useObjectsDnd({
	profileId,
	apiToken,
	bucket,
	prefix,
	canDragDrop,
	isDesktop,
	selectedKeys,
	setSelectedKeys,
	setLastSelectedObjectKey,
	createJobWithRetry,
	queryClient,
}: UseObjectsDndArgs) {
	const [dndHoverPrefix, setDndHoverPrefix] = useState<string | null>(null)
	const navigate = useNavigate()
	const dndContextVersionRef = useRef(0)

	const invalidateDndContext = useCallback(() => {
		dndContextVersionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateDndContext()
	}, [apiToken, bucket, invalidateDndContext, prefix, profileId])

	const normalizeDropTargetPrefix = useCallback((raw: string): string => {
		const trimmed = raw.trim()
		if (!trimmed || trimmed === '/') return ''
		return normalizePrefix(trimmed)
	}, [])

	const onDndTargetDragOver = useCallback(
		(e: React.DragEvent, targetPrefixRaw: string) => {
			if (!canDragDrop) return
			const intent = resolveObjectsDropIntent(e.dataTransfer)
			if (intent === 'external_upload') {
				e.preventDefault()
				e.stopPropagation()
				e.dataTransfer.dropEffect = 'none'
				setDndHoverPrefix(null)
				return
			}
			if (intent !== 'internal_object_dnd') return
			e.preventDefault()
			e.stopPropagation()
			setDndHoverPrefix(normalizeDropTargetPrefix(targetPrefixRaw))
			e.dataTransfer.dropEffect = dropModeFromEvent(e) === 'copy' ? 'copy' : 'move'
		},
		[canDragDrop, normalizeDropTargetPrefix],
	)

	const onDndTargetDragLeave = useCallback(
		(e: React.DragEvent, targetPrefixRaw: string) => {
			if (!hasInternalObjectsDndPayload(e.dataTransfer)) return
			e.stopPropagation()
			const related = e.relatedTarget
			if (related instanceof Node && e.currentTarget.contains(related)) return
			const target = normalizeDropTargetPrefix(targetPrefixRaw)
			setDndHoverPrefix((prev) => (prev === target ? null : prev))
		},
		[normalizeDropTargetPrefix],
	)

	const onDndTargetDrop = useCallback(
		(e: React.DragEvent, targetPrefixRaw: string) => {
			if (!canDragDrop) return
			const intent = resolveObjectsDropIntent(e.dataTransfer)
			if (intent === 'external_upload') {
				e.preventDefault()
				e.stopPropagation()
				setDndHoverPrefix(null)
				void import('./objectsDndRuntime').then(({ showObjectsDndLocalFilesOnFolderTargetUnsupported }) => {
					showObjectsDndLocalFilesOnFolderTargetUnsupported()
				})
				return
			}
			if (intent !== 'internal_object_dnd') return
			e.preventDefault()
			e.stopPropagation()
			setDndHoverPrefix(null)

			const payload = parseDndPayload(e.dataTransfer)
			if (!payload) return
			const mode = dropModeFromEvent(e)
			const contextVersion = dndContextVersionRef.current
			void import('./objectsDndRuntime')
				.then(({ performObjectsDrop }) =>
					performObjectsDrop({
						payload,
						targetPrefixRaw,
						mode,
						profileId,
						apiToken,
						bucket,
						prefix,
						contextVersion,
						isCurrentContext: (version) => version === dndContextVersionRef.current,
						createJobWithRetry,
						queryClient,
						onOpenJobs: () => navigate('/jobs'),
					}),
				)
				.catch(async (err) => {
					const { showObjectsDndError } = await import('./objectsDndRuntime')
					showObjectsDndError(err)
				})
		},
		[apiToken, bucket, canDragDrop, createJobWithRetry, navigate, prefix, profileId, queryClient],
	)

	const onRowDragStartObjects = useCallback(
		(e: React.DragEvent, key: string) => {
			if (!canDragDrop) return
			if (!profileId || !bucket) return
			const keysToDrag = selectedKeys.has(key) ? Array.from(selectedKeys) : [key]
			if (!selectedKeys.has(key)) {
				setSelectedKeys(new Set([key]))
				setLastSelectedObjectKey(key)
			}
			e.dataTransfer.setData(OBJECTS_DND_MIME, JSON.stringify({ kind: 'objects', bucket, keys: keysToDrag }))
			e.dataTransfer.setData('text/plain', keysToDrag.join('\n'))
			e.dataTransfer.effectAllowed = 'copyMove'
		},
		[bucket, canDragDrop, profileId, selectedKeys, setLastSelectedObjectKey, setSelectedKeys],
	)

	const onRowDragStartPrefix = useCallback(
		(e: React.DragEvent, p: string) => {
			if (!canDragDrop) return
			if (!profileId || !bucket) return
			const srcPrefix = normalizePrefix(p)
			e.dataTransfer.setData(OBJECTS_DND_MIME, JSON.stringify({ kind: 'prefix', bucket, prefix: srcPrefix }))
			e.dataTransfer.setData('text/plain', srcPrefix)
			e.dataTransfer.effectAllowed = 'copyMove'
		},
		[bucket, canDragDrop, profileId],
	)

	const clearDndHover = useCallback(() => setDndHoverPrefix(null), [])

	const effectiveDndHoverPrefix = isDesktop ? dndHoverPrefix : null

	return {
		dndHoverPrefix: effectiveDndHoverPrefix,
		normalizeDropTargetPrefix,
		onDndTargetDragOver,
		onDndTargetDragLeave,
		onDndTargetDrop,
		onRowDragStartObjects,
		onRowDragStartPrefix,
		clearDndHover,
	}
}
