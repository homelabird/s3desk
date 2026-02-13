import { useMutation, type QueryClient } from '@tanstack/react-query'
import { Button, Space, Typography, message } from 'antd'
import { useCallback, useState } from 'react'

import type { Job, JobCreateRequest } from '../../api/types'
import { clipboardFailureHint, copyToClipboard } from '../../lib/clipboard'
import { confirmDangerAction } from '../../lib/confirmDangerAction'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { fileNameFromKey, normalizePrefix } from './objectsListUtils'
import type { ClipboardObjects } from './objectsActionCatalog'

type UseObjectsClipboardArgs = {
	profileId: string | null
	bucket: string
	prefix: string
	selectedKeys: Set<string>
	createJobWithRetry: (req: JobCreateRequest) => Promise<Job>
	queryClient: QueryClient
}

export function useObjectsClipboard({
	profileId,
	bucket,
	prefix,
	selectedKeys,
	createJobWithRetry,
	queryClient,
}: UseObjectsClipboardArgs) {
	const [clipboardObjects, setClipboardObjects] = useState<ClipboardObjects | null>(null)

	const pasteObjectsMutation = useMutation({
		mutationFn: async (args: {
			mode: 'copy' | 'move'
			srcBucket: string
			srcPrefix: string
			keys: string[]
			dstBucket: string
			dstPrefix: string
		}) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')

			const srcBucket = args.srcBucket.trim()
			const dstBucket = args.dstBucket.trim()
			if (!srcBucket) throw new Error('source bucket is required')
			if (!dstBucket) throw new Error('destination bucket is required')

			const srcPrefix = normalizePrefix(args.srcPrefix)
			const dstPrefix = normalizePrefix(args.dstPrefix)

			const uniqueKeys = Array.from(new Set(args.keys.map((k) => k.trim()).filter(Boolean)))
			if (uniqueKeys.length === 0) throw new Error('no keys to paste')
			if (uniqueKeys.length > 50_000) throw new Error('too many keys to paste; use a prefix job instead')

			const items: { srcKey: string; dstKey: string }[] = []
			const dstSet = new Set<string>()

			for (const srcKeyRaw of uniqueKeys) {
				const srcKey = srcKeyRaw.replace(/^\/+/, '')
				if (!srcKey) continue

				let rel: string
				if (srcPrefix && srcKey.startsWith(srcPrefix)) {
					rel = srcKey.slice(srcPrefix.length)
				} else {
					rel = fileNameFromKey(srcKey)
				}
				rel = rel.replace(/^\/+/, '')
				if (!rel) rel = fileNameFromKey(srcKey)

				const dstKey = `${dstPrefix}${rel}`
				if (srcBucket === dstBucket && dstKey === srcKey) continue

				if (dstSet.has(dstKey)) {
					throw new Error(`multiple keys map to the same destination: ${dstKey}`)
				}
				dstSet.add(dstKey)
				items.push({ srcKey, dstKey })
			}

			if (items.length === 0) throw new Error('nothing to paste (already in destination)')

			const type = args.mode === 'copy' ? 'transfer_copy_batch' : 'transfer_move_batch'
			return createJobWithRetry({
				type,
				payload: {
					srcBucket,
					dstBucket,
					items,
					dryRun: false,
				},
			})
		},
		onSuccess: async (job, args) => {
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>{args.mode === 'copy' ? 'Paste copy task' : 'Paste move task'} started: {job.id}</Typography.Text>
						<Button size="small" type="link" href="/jobs">
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			if (args.mode === 'move') {
				setClipboardObjects(null)
			}
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const onCopy = useCallback(async (value: string) => {
		const res = await copyToClipboard(value)
		if (res.ok) {
			message.success('Copied')
			return
		}
		message.error(clipboardFailureHint())
	}, [])

	const copySelectionToClipboard = useCallback(
		async (mode: 'copy' | 'move') => {
			if (!bucket) return
			const keys = Array.from(selectedKeys)
			if (keys.length === 0) return

			setClipboardObjects({ mode, srcBucket: bucket, srcPrefix: normalizePrefix(prefix), keys })

			const res = await copyToClipboard(keys.join('\n'))
			if (res.ok) {
				message.success(mode === 'copy' ? `Copied ${keys.length} key(s)` : `Cut ${keys.length} key(s)`)
				return
			}
			message.warning(`Saved internally, but clipboard failed: ${clipboardFailureHint()}`)
		},
		[bucket, prefix, selectedKeys],
	)

	const commonPrefixFromKeys = useCallback((keys: string[]): string => {
		const parts = keys
			.map((k) => k.replace(/^\/+/, '').split('/').filter(Boolean))
			.filter((p) => p.length > 0)
		if (parts.length === 0) return ''
		let prefixParts = parts[0]
		for (let i = 1; i < parts.length; i++) {
			const next = parts[i]
			let j = 0
			while (j < prefixParts.length && j < next.length && prefixParts[j] === next[j]) j++
			prefixParts = prefixParts.slice(0, j)
			if (prefixParts.length === 0) return ''
		}
		return prefixParts.length ? `${prefixParts.join('/')}/` : ''
	}, [])

	const readClipboardObjectsFromSystemClipboard = useCallback(async (): Promise<ClipboardObjects | null> => {
		if (!bucket) {
			message.info('Select a bucket first')
			return null
		}
		if (!navigator.clipboard?.readText) {
			message.error(clipboardFailureHint())
			return null
		}

		let text = ''
		try {
			text = await navigator.clipboard.readText()
		} catch {
			message.error(clipboardFailureHint())
			return null
		}
		const lines = text
			.split('\n')
			.map((l) => l.trim())
			.filter(Boolean)
		if (lines.length === 0) {
			message.info('Clipboard is empty')
			return null
		}

		const parsed: { bucket: string; key: string }[] = []
		for (const line of lines) {
			if (line.startsWith('s3://')) {
				const rest = line.slice('s3://'.length)
				const idx = rest.indexOf('/')
				if (idx <= 0) continue
				const b = rest.slice(0, idx)
				const k = rest.slice(idx + 1).replace(/^\/+/, '')
				if (!b || !k) continue
				parsed.push({ bucket: b, key: k })
				continue
			}
			const k = line.replace(/^\/+/, '')
			if (!k) continue
			parsed.push({ bucket, key: k })
		}

		if (parsed.length === 0) {
			message.info('Clipboard does not contain any object keys')
			return null
		}

		const buckets = Array.from(new Set(parsed.map((p) => p.bucket)))
		if (buckets.length !== 1) {
			message.error('Clipboard contains multiple buckets; copy from one bucket at a time')
			return null
		}

		const srcBucket = buckets[0]
		const keys = parsed.map((p) => p.key)
		return { mode: 'copy', srcBucket, srcPrefix: commonPrefixFromKeys(keys), keys }
	}, [bucket, commonPrefixFromKeys])

	const pasteClipboardObjects = useCallback(async () => {
		if (!profileId) {
			message.info('Select a profile first')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}

		const src = clipboardObjects ?? (await readClipboardObjectsFromSystemClipboard())
		if (!src) return

		setClipboardObjects(src)

		const mode = src.mode
		const doPaste = async () => {
			await pasteObjectsMutation.mutateAsync({
				mode,
				srcBucket: src.srcBucket,
				srcPrefix: src.srcPrefix,
				keys: src.keys,
				dstBucket: bucket,
				dstPrefix: prefix,
			})
		}

		if (mode === 'move') {
			confirmDangerAction({
				title: `Move ${src.keys.length} object(s) here?`,
				description: 'This creates a move job (copy then delete source).',
				confirmText: 'MOVE',
				confirmHint: 'Type "MOVE" to confirm',
				okText: 'Move',
				onConfirm: async () => doPaste(),
			})
			return
		}

		await doPaste()
	}, [bucket, clipboardObjects, pasteObjectsMutation, prefix, profileId, readClipboardObjectsFromSystemClipboard])

	return {
		clipboardObjects,
		onCopy,
		copySelectionToClipboard,
		pasteClipboardObjects,
	}
}
