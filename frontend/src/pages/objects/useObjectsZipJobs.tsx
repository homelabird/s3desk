import { Button, Space, Typography, message } from 'antd'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'

import type { Job, JobCreateRequest } from '../../api/types'
import type { TransfersContextValue } from '../../components/Transfers'
import { formatErrorWithHint as formatErr } from '../../lib/errors'
import { normalizePrefix } from './objectsListUtils'

type CreateJobWithRetry = (req: JobCreateRequest) => Promise<Job>

type UseObjectsZipJobsArgs = {
	profileId: string | null
	apiToken: string
	bucket: string
	prefix: string
	transfers: TransfersContextValue
	createJobWithRetry: CreateJobWithRetry
}

export function useObjectsZipJobs({
	profileId,
	apiToken,
	bucket,
	prefix,
	transfers,
	createJobWithRetry,
}: UseObjectsZipJobsArgs) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const zipContextVersionRef = useRef(0)

	const invalidateZipContext = useCallback(() => {
		zipContextVersionRef.current += 1
	}, [])

	useEffect(() => {
		invalidateZipContext()
	}, [apiToken, bucket, invalidateZipContext, prefix, profileId, transfers])

	const zipPrefixJobMutation = useMutation({
		mutationFn: async (args: { prefix: string }) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			return createJobWithRetry({
				type: 's3_zip_prefix',
				payload: { bucket, prefix: normalizePrefix(args.prefix) },
			})
		},
		onMutate: () => ({
			contextVersion: zipContextVersionRef.current,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (job, args, context) => {
			await queryClient.invalidateQueries({
				queryKey: ['jobs', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: false,
			})
			if (context?.contextVersion !== zipContextVersionRef.current) return
			const normPrefix = normalizePrefix(args.prefix)
			const label = normPrefix ? `Folder zip: ${normPrefix}` : 'Folder zip: (root)'
			transfers.queueDownloadJobArtifact({
				profileId: profileId!,
				jobId: job.id,
				label,
				filenameHint: `job-${job.id}.zip`,
				waitForJob: job.status !== 'succeeded',
			})
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Zip task started: {job.id}</Typography.Text>
						<Button size="small" type="link" onClick={() => transfers.openTransfers('downloads')}>
							Open Transfers
						</Button>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
		},
		onError: (err, _args, context) => {
			if (context?.contextVersion !== zipContextVersionRef.current) return
			message.error(formatErr(err))
		},
	})

	const zipObjectsJobMutation = useMutation({
		mutationFn: async (args: { keys: string[] }) => {
			if (!profileId) throw new Error('profile is required')
			if (!bucket) throw new Error('bucket is required')
			if (args.keys.length < 1) throw new Error('select objects first')
			if (args.keys.length > 10_000) throw new Error('too many keys (max 10000)')
			return createJobWithRetry({
				type: 's3_zip_objects',
				payload: {
					bucket,
					keys: args.keys,
					stripPrefix: normalizePrefix(prefix),
				},
			})
		},
		onMutate: () => ({
			contextVersion: zipContextVersionRef.current,
			scopeProfileId: profileId,
			scopeApiToken: apiToken,
		}),
		onSuccess: async (job, args, context) => {
			await queryClient.invalidateQueries({
				queryKey: ['jobs', context?.scopeProfileId ?? profileId, context?.scopeApiToken ?? apiToken],
				exact: false,
			})
			if (context?.contextVersion !== zipContextVersionRef.current) return
			const label = `Zip selection: ${args.keys.length} object(s)`
			transfers.queueDownloadJobArtifact({
				profileId: profileId!,
				jobId: job.id,
				label,
				filenameHint: `job-${job.id}.zip`,
				waitForJob: job.status !== 'succeeded',
			})
			message.open({
				type: 'success',
				content: (
					<Space>
						<Typography.Text>Zip task started: {job.id}</Typography.Text>
						<Button size="small" type="link" onClick={() => transfers.openTransfers('downloads')}>
							Open Transfers
						</Button>
						<Button size="small" type="link" onClick={() => navigate('/jobs')}>
							Open Jobs
						</Button>
					</Space>
				),
				duration: 6,
			})
		},
		onError: (err, _args, context) => {
			if (context?.contextVersion !== zipContextVersionRef.current) return
			message.error(formatErr(err))
		},
	})

	return {
		zipPrefixJobMutation,
		zipObjectsJobMutation,
	}
}
