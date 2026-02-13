import { useCallback, useState } from 'react'
import { Button, Form, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'

import type { Job, JobCreateRequest } from '../../api/types'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { fileNameFromKey, folderLabelFromPrefix, normalizePrefix, parentPrefixFromKey } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsRenameArgs = {
	profileId: string | null
	bucket: string
	createJobWithRetry: CreateJobWithRetry
}

type RenameFormValues = { name: string; confirm: string }

export function useObjectsRename({ profileId, bucket, createJobWithRetry }: UseObjectsRenameArgs) {
	const queryClient = useQueryClient()
	const [renameOpen, setRenameOpen] = useState(false)
	const [renameKind, setRenameKind] = useState<'object' | 'prefix'>('object')
	const [renameSource, setRenameSource] = useState<string | null>(null)
	const [renameForm] = Form.useForm<RenameFormValues>()

	const focusRenameInput = useCallback(() => {
		window.setTimeout(() => {
			const el = document.getElementById('objectsRenameInput') as HTMLInputElement | null
			el?.focus()
		}, 0)
	}, [])

	const openRenameObject = useCallback(
		(key: string) => {
			if (!profileId || !bucket) return
			setRenameKind('object')
			setRenameSource(key)
			renameForm.setFieldsValue({ name: fileNameFromKey(key), confirm: '' })
			setRenameOpen(true)
			focusRenameInput()
		},
		[bucket, focusRenameInput, profileId, renameForm],
	)

	const openRenamePrefix = useCallback(
		(srcPrefix: string) => {
			if (!profileId || !bucket) return
			setRenameKind('prefix')
			setRenameSource(srcPrefix)
			renameForm.setFieldsValue({ name: folderLabelFromPrefix(srcPrefix), confirm: '' })
			setRenameOpen(true)
			focusRenameInput()
		},
		[bucket, focusRenameInput, profileId, renameForm],
	)

	const renameMutation = useMutation({
		mutationFn: async (args: { kind: 'object' | 'prefix'; src: string; name: string }) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			const raw = args.name.trim().replace(/\/+$/, '')
			if (!raw) throw new Error('name is required')
			if (raw === '.' || raw === '..') throw new Error('invalid name')
			if (raw.includes('/')) throw new Error("name must not contain '/'")
			if (raw.includes('\u0000')) throw new Error('invalid name')

			if (args.kind === 'prefix') {
				const srcPrefix = normalizePrefix(args.src)
				const parent = parentPrefixFromKey(srcPrefix.replace(/\/+$/, ''))
				const dstPrefix = `${parent}${raw}/`
				if (dstPrefix === srcPrefix) throw new Error('already in destination')
				if (dstPrefix.startsWith(srcPrefix)) throw new Error('destination must not be under source prefix')
				return createJobWithRetry({
					type: 'transfer_move_prefix',
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
			}

			const srcKey = args.src.trim().replace(/^\/+/, '')
			const parent = parentPrefixFromKey(srcKey)
			const dstKey = `${parent}${raw}`
			if (dstKey === srcKey) throw new Error('already in destination')
			return createJobWithRetry({
				type: 'transfer_move_object',
				payload: {
					srcBucket: bucket,
					srcKey,
					dstBucket: bucket,
					dstKey,
					dryRun: false,
				},
			})
		},
		onSuccess: async (job) => {
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Rename task started: {job.id}</Typography.Text>
						<Button size="small" type="link" href="/jobs">
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
			setRenameOpen(false)
			setRenameSource(null)
			renameForm.resetFields()
			await queryClient.invalidateQueries({ queryKey: ['jobs'] })
		},
		onError: (err) => message.error(formatErr(err)),
	})

	const handleRenameSubmit = useCallback(
		(values: RenameFormValues) => {
			if (!renameSource) return
			renameMutation.mutate({ kind: renameKind, src: renameSource, name: values.name })
		},
		[renameKind, renameMutation, renameSource],
	)

	const handleRenameCancel = useCallback(() => {
		setRenameOpen(false)
		setRenameSource(null)
		renameForm.resetFields()
	}, [renameForm])

	return {
		renameOpen,
		renameKind,
		renameSource,
		renameForm,
		renameSubmitting: renameMutation.isPending,
		openRenameObject,
		openRenamePrefix,
		handleRenameSubmit,
		handleRenameCancel,
	}
}
