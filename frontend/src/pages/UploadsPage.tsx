import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Grid, Input, Select, Space, Switch, Typography, Upload, message } from 'antd'
import type { UploadFile } from 'antd'
import { UploadOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient, APIError } from '../api/client'
import type { Bucket } from '../api/types'
import { useTransfers } from '../components/useTransfers'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import { useIsOffline } from '../lib/useIsOffline'
import { SetupCallout } from '../components/SetupCallout'

type Props = {
	apiToken: string
	profileId: string | null
}

export function UploadsPage(props: Props) {
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
	const navigate = useNavigate()
	const screens = Grid.useBreakpoint()
	const isOffline = useIsOffline()

	const [bucket, setBucket] = useLocalStorageState<string>('bucket', '')
	const [prefix, setPrefix] = useLocalStorageState<string>('uploadPrefix', '')
	const [folderMode, setFolderMode] = useState(false)
	const [fileList, setFileList] = useState<UploadFile[]>([])

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to upload files" />
	}

	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))
	const showBucketsEmpty = bucketsQuery.isFetched && bucketOptions.length === 0
	const files = fileList
		.map((f) => attachRelativePath(f))
		.filter((file): file is NonNullable<typeof file> => !!file)

	const queueUpload = () => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!bucket) {
			message.info('Select a bucket first')
			return
		}
		if (files.length === 0) {
			message.info('Select files first')
			return
		}
		transfers.queueUploadFiles({ profileId: props.profileId!, bucket, prefix, files })
		setFileList([])
	}

	return (
		<Space direction="vertical" size="large" style={{ width: '100%' }}>
			<Typography.Title level={3} style={{ margin: 0 }}>
				Uploads
			</Typography.Title>

			{isOffline ? <Alert type="warning" showIcon message="Offline: uploads are disabled." /> : null}

			{showBucketsEmpty ? (
				<Empty description="No buckets available">
					<Button onClick={() => navigate('/buckets')}>Go to Buckets</Button>
				</Empty>
			) : null}

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon message="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			<Space wrap style={{ width: '100%' }}>
				<Select
					showSearch
					placeholder="Bucket"
					style={{ width: screens.md ? 320 : '100%', maxWidth: '100%' }}
					value={bucket || undefined}
					options={bucketOptions}
					loading={bucketsQuery.isFetching}
					onChange={(v) => setBucket(v)}
					optionFilterProp="label"
					disabled={isOffline}
				/>
				<Input
					placeholder="prefix (optional)"
					style={{ width: screens.md ? 420 : '100%', maxWidth: '100%' }}
					value={prefix}
					onChange={(e) => setPrefix(e.target.value)}
					disabled={isOffline}
				/>
				<Space>
					<Typography.Text type="secondary">Folder mode</Typography.Text>
					<Switch checked={folderMode} onChange={setFolderMode} disabled={isOffline} />
				</Space>
			</Space>

			<Upload
				multiple
				directory={folderMode}
				beforeUpload={() => false}
				fileList={fileList}
				onChange={({ fileList: next }) => setFileList(next)}
				disabled={isOffline}
			>
				<Button icon={<UploadOutlined />} disabled={isOffline}>
					{folderMode ? 'Select folder' : 'Select files'}
				</Button>
			</Upload>

			<Space wrap>
				<Button type="primary" onClick={queueUpload} disabled={isOffline || !bucket || files.length === 0}>
					Queue upload
				</Button>
				<Button onClick={() => transfers.openTransfers('uploads')}>Open Transfers</Button>
			</Space>
		</Space>
	)
}

function attachRelativePath(file: UploadFile): File | null {
	const origin = file.originFileObj
	if (!origin) return null

	const fileWithPath = origin as File & { webkitRelativePath?: string; relativePath?: string }
	const relPath =
		(fileWithPath.webkitRelativePath ?? fileWithPath.relativePath ?? (file as unknown as { webkitRelativePath?: string }).webkitRelativePath ?? '')
			.trim()
	if (relPath && !fileWithPath.relativePath) {
		fileWithPath.relativePath = relPath
	}
	return origin
}

function formatErr(err: unknown): string {
	if (err instanceof APIError) return `${err.code}: ${err.message}`
	if (err instanceof Error) return err.message
	return 'unknown error'
}
