import { Button, Space, Typography, message } from 'antd'
import type { QueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'

import type { Job, JobCreateRequest } from '../../api/types'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { displayNameForKey, folderLabelFromPrefix, normalizePrefix } from './objectsListUtils'

const DND_MIME = 'application/x-s3desk-dnd'

const hasDndPayload = (dt: DataTransfer | null): boolean => {
	if (!dt) return false
	const types = Array.from(dt.types ?? [])
	return types.includes(DND_MIME)
}

const parseDndPayload = (dt: DataTransfer): DndPayload | null => {
	const raw = dt.getData(DND_MIME)
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

type DndPayload =
	| { kind: 'objects'; bucket: string; keys: string[] }
	| { kind: 'prefix'; bucket: string; prefix: string }

type UseObjectsDndArgs = {
	profileId: string | null
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

	const normalizeDropTargetPrefix = useCallback((raw: string): string => {
		const trimmed = raw.trim()
		if (!trimmed || trimmed === '/') return ''
		return normalizePrefix(trimmed)
	}, [])

	const createJobAndNotify = useCallback(
		async (req: JobCreateRequest) => {
			if (!profileId) throw new Error('profile is required')
			const job = await createJobWithRetry(req)
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Task started: {job.id}</Typography.Text>
						<Button size="small" type="link" href="/jobs">
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
			return job
		},
		[createJobWithRetry, profileId, queryClient],
	)

	const performDrop = useCallback(async (payload: DndPayload, targetPrefixRaw: string, mode: 'copy' | 'move') => {
		if (!profileId || !bucket) return
		if (payload.bucket !== bucket) {
			message.warning('Drag & drop across buckets is not supported yet')
			return
		}

		const targetPrefix = normalizeDropTargetPrefix(targetPrefixRaw)

		if (payload.kind === 'prefix') {
			const srcPrefix = normalizePrefix(payload.prefix)
			const folderName = folderLabelFromPrefix(srcPrefix)
			const dstPrefix = `${targetPrefix}${folderName}/`

			if (dstPrefix === srcPrefix) {
				message.info('Already in destination')
				return
			}
			if (dstPrefix.startsWith(srcPrefix)) {
				message.error('Cannot move/copy a folder into itself')
				return
			}

			const doCreate = async () =>
				createJobAndNotify({
					type: mode === 'copy' ? 'transfer_copy_prefix' : 'transfer_move_prefix',
					payload: {
						srcBucket: bucket,
						srcPrefix,
						dstBucket: bucket,
						dstPrefix,
						include: [],
						exclude: [],
						dryRun: false,
					},
				})

			if (mode === 'move') {
				confirmDangerAction({
					title: `Move folder?`,
					description: (
						<Space orientation="vertical" size="small">
							<Typography.Text>
								Move <Typography.Text code>{`s3://${bucket}/${srcPrefix}`}</Typography.Text> →{' '}
								<Typography.Text code>{`s3://${bucket}/${dstPrefix}`}</Typography.Text>
							</Typography.Text>
							<Typography.Text type="secondary">This will create a job and remove the source objects.</Typography.Text>
						</Space>
					),
					confirmText: 'MOVE',
					confirmHint: 'Type "MOVE" to confirm',
					okText: 'Move',
					onConfirm: async () => {
						await doCreate()
					},
				})
				return
			}

			await doCreate()
			return
		}

		const keys = payload.keys.filter(Boolean)
		if (keys.length < 1) return

		const pairs = keys
			.map((srcKey) => {
				const name = displayNameForKey(srcKey, prefix)
				const dstKey = `${targetPrefix}${name}`
				return { srcKey, dstKey }
			})
			.filter((p) => p.srcKey && p.dstKey)
			.filter((p) => !(p.srcKey === p.dstKey))

		if (pairs.length === 0) {
			message.info('Already in destination')
			return
		}

		const doCreate = async () => {
			if (pairs.length > 1) {
				return createJobAndNotify({
					type: mode === 'copy' ? 'transfer_copy_batch' : 'transfer_move_batch',
					payload: {
						srcBucket: bucket,
						dstBucket: bucket,
						items: pairs,
						dryRun: false,
					},
				})
			}
			return createJobAndNotify({
				type: mode === 'copy' ? 'transfer_copy_object' : 'transfer_move_object',
				payload: {
					srcBucket: bucket,
					srcKey: pairs[0].srcKey,
					dstBucket: bucket,
					dstKey: pairs[0].dstKey,
					dryRun: false,
				},
			})
		}

		if (mode === 'move') {
			confirmDangerAction({
				title: `Move ${pairs.length} object(s)?`,
				description: (
					<Space orientation="vertical" size="small">
						<Typography.Text>
							Move to <Typography.Text code>{`s3://${bucket}/${targetPrefix}`}</Typography.Text>
						</Typography.Text>
						<Typography.Text type="secondary">This will create a job and remove the source objects.</Typography.Text>
					</Space>
				),
				confirmText: 'MOVE',
				confirmHint: 'Type "MOVE" to confirm',
				okText: 'Move',
				onConfirm: async () => {
					await doCreate()
				},
			})
			return
		}

		await doCreate()
	}, [bucket, createJobAndNotify, normalizeDropTargetPrefix, prefix, profileId])

	const onDndTargetDragOver = useCallback(
		(e: React.DragEvent, targetPrefixRaw: string) => {
			if (!canDragDrop) return
			if (!hasDndPayload(e.dataTransfer)) return
			e.preventDefault()
			setDndHoverPrefix(normalizeDropTargetPrefix(targetPrefixRaw))
			e.dataTransfer.dropEffect = dropModeFromEvent(e) === 'copy' ? 'copy' : 'move'
		},
		[canDragDrop, normalizeDropTargetPrefix],
	)

	const onDndTargetDragLeave = useCallback(
		(_e: React.DragEvent, targetPrefixRaw: string) => {
			const target = normalizeDropTargetPrefix(targetPrefixRaw)
			setDndHoverPrefix((prev) => (prev === target ? null : prev))
		},
		[normalizeDropTargetPrefix],
	)

	const onDndTargetDrop = useCallback(
		(e: React.DragEvent, targetPrefixRaw: string) => {
			if (!canDragDrop) return
			if (!hasDndPayload(e.dataTransfer)) return
			e.preventDefault()
			setDndHoverPrefix(null)

			const payload = parseDndPayload(e.dataTransfer)
			if (!payload) return
			const mode = dropModeFromEvent(e)
			void performDrop(payload, targetPrefixRaw, mode).catch((err) => message.error(formatErr(err)))
		},
		[canDragDrop, performDrop],
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
			e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: 'objects', bucket, keys: keysToDrag }))
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
			e.dataTransfer.setData(DND_MIME, JSON.stringify({ kind: 'prefix', bucket, prefix: srcPrefix }))
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
