import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Dropdown, Empty, Grid, Input, Select, Space, Switch, Tooltip, Typography, Upload, message, type MenuProps } from 'antd'
import type { UploadFile } from 'antd'
import { EllipsisOutlined, UploadOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { APIClient } from '../api/client'
import type { Bucket, Profile } from '../api/types'
import { useTransfers } from '../components/useTransfers'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../lib/providerCapabilities'
import { formatBytes } from '../lib/transfer'
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
		return profilesQuery.data?.find((p) => p.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])
	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers)
		: null
	const uploadsSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadsUnsupportedReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})
	const topMoreMenu = useMemo<MenuProps>(
		() => ({
			items: [
				{
					key: 'open_transfers',
					label: 'Open Transfers',
					disabled: !props.profileId,
				},
				{
					key: 'clear_selected_files',
					label: 'Clear selected files',
					disabled: fileList.length === 0,
				},
			],
			onClick: ({ key }) => {
				if (key === 'open_transfers') {
					transfers.openTransfers('uploads')
					return
				}
				if (key === 'clear_selected_files') {
					setFileList([])
				}
			},
		}),
		[fileList.length, props.profileId, transfers],
	)
	const files = fileList
		.map((f) => attachRelativePath(f))
		.filter((file): file is NonNullable<typeof file> => !!file)
	const selectedFileCount = files.length
	const selectedTotalBytes = useMemo(() => files.reduce((sum, file) => sum + (file.size || 0), 0), [files])
	const queueDisabledReason = useMemo(() => {
		if (isOffline) return 'Offline: uploads are disabled.'
		if (!uploadsSupported) return uploadsUnsupportedReason ?? 'Uploads are not supported by this provider.'
		if (!bucket) return 'Select a bucket first.'
		if (selectedFileCount === 0) return folderMode ? 'Select a folder first.' : 'Select files first.'
		return null
	}, [bucket, folderMode, isOffline, selectedFileCount, uploadsSupported, uploadsUnsupportedReason])

	if (!props.profileId) {
		return <SetupCallout apiToken={props.apiToken} profileId={props.profileId} message="Select a profile to upload files" />
	}

	const bucketOptions = (bucketsQuery.data ?? []).map((b: Bucket) => ({ label: b.name, value: b.name }))
	const showBucketsEmpty = bucketsQuery.isFetched && bucketOptions.length === 0
	const canQueueUpload = !isOffline && uploadsSupported && !!bucket && files.length > 0

	const queueUpload = () => {
		if (isOffline) {
			message.warning('Offline: uploads are disabled.')
			return
		}
		if (!uploadsSupported) {
			message.warning(uploadsUnsupportedReason ?? 'Uploads are not supported by this provider.')
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
		<Space orientation="vertical" size="large" style={{ width: '100%' }}>
			<div
				style={{
					display: 'flex',
					width: '100%',
					justifyContent: 'space-between',
					alignItems: 'center',
					gap: 12,
					flexWrap: 'wrap',
				}}
			>
				<Typography.Title level={3} style={{ margin: 0 }}>
					Uploads
				</Typography.Title>
				<Space wrap>
					<Tooltip title={queueDisabledReason ?? 'Queue selected files as an upload job'}>
						<span>
							<Button type="primary" onClick={queueUpload} disabled={!canQueueUpload}>
								Queue upload{selectedFileCount > 0 ? ` (${selectedFileCount})` : ''}
							</Button>
						</span>
					</Tooltip>
					<Dropdown menu={topMoreMenu} trigger={['click']} placement="bottomRight">
						<Button icon={<EllipsisOutlined />}>More</Button>
					</Dropdown>
				</Space>
			</div>

			{isOffline ? <Alert type="warning" showIcon title="Offline: uploads are disabled." /> : null}
			{!uploadsSupported ? (
				<Alert type="info" showIcon title="Uploads are not available for this provider" description={uploadsUnsupportedReason} />
			) : null}

			{showBucketsEmpty ? (
				<Empty description="No buckets available">
					<Button
						href="/buckets"
						onClick={(event) => {
							event.preventDefault()
							navigate('/buckets')
						}}
					>
						Go to Buckets
					</Button>
				</Empty>
			) : null}

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon title="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			<Space wrap style={{ width: '100%' }}>
				<Select
					showSearch
					placeholder="Bucket…"
					style={{ width: screens.md ? 320 : '100%', maxWidth: '100%' }}
					aria-label="Bucket"
					value={bucket || undefined}
					options={bucketOptions}
					loading={bucketsQuery.isFetching}
					onChange={(v) => setBucket(v)}
					optionFilterProp="label"
					disabled={isOffline || !uploadsSupported}
				/>
				<Input
					placeholder="prefix (optional)…"
					style={{ width: screens.md ? 420 : '100%', maxWidth: '100%' }}
					value={prefix}
					onChange={(e) => setPrefix(e.target.value)}
					disabled={isOffline || !uploadsSupported}
				/>
				<Space>
					<Typography.Text type="secondary">Folder mode</Typography.Text>
					<Switch checked={folderMode} onChange={setFolderMode} disabled={isOffline || !uploadsSupported} />
				</Space>
			</Space>

			<Upload
				multiple
				directory={folderMode}
				beforeUpload={() => false}
				fileList={fileList}
				onChange={({ fileList: next }) => setFileList(next)}
				disabled={isOffline || !uploadsSupported}
			>
				<Button icon={<UploadOutlined />} disabled={isOffline || !uploadsSupported}>
					{folderMode ? 'Select folder' : 'Select files'}
				</Button>
			</Upload>

			<Typography.Text type="secondary">
				{selectedFileCount > 0
					? `Selected ${selectedFileCount.toLocaleString()} file(s) · ${formatBytes(selectedTotalBytes)}`
					: folderMode
						? 'No folder selected.'
						: 'No files selected.'}
			</Typography.Text>
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

// formatErr lives in ../lib/errors
