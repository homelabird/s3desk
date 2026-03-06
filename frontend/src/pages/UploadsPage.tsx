import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Dropdown, Empty, Input, Space, Switch, Tooltip, Typography, Upload, message, type MenuProps } from 'antd'
import type { UploadFile } from 'antd'
import { EllipsisOutlined, UploadOutlined } from '@ant-design/icons'
import { useMemo, useState } from 'react'

import { APIClient } from '../api/client'
import type { Bucket, Profile } from '../api/types'
import { PageHeader } from '../components/PageHeader'
import { PageSection } from '../components/PageSection'
import { SetupCallout } from '../components/SetupCallout'
import { DatalistInput } from '../components/DatalistInput'
import { LinkButton } from '../components/LinkButton'
import { useTransfers } from '../components/useTransfers'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../lib/providerCapabilities'
import { formatBytes } from '../lib/transfer'
import { useIsOffline } from '../lib/useIsOffline'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import styles from './UploadsPage.module.css'

type Props = {
	apiToken: string
	profileId: string | null
}

export function UploadsPage(props: Props) {
	const api = useMemo(() => new APIClient({ apiToken: props.apiToken }), [props.apiToken])
	const transfers = useTransfers()
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
	const previewFiles = useMemo(
		() =>
			files.slice(0, 6).map((file) => ({
				name: getRelativePathLabel(file),
				size: file.size ?? 0,
			})),
		[files],
	)
	const remainingPreviewCount = Math.max(0, selectedFileCount - previewFiles.length)
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
	const normalizedPrefix = prefix.trim().replace(/^\/+/, '')
	const destinationLabel = bucket ? `s3://${bucket}${normalizedPrefix ? `/${normalizedPrefix}` : '/'}` : 'No bucket selected'

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
		<div className={styles.pageStack}>
			<PageHeader
				eyebrow="Transfer"
				title="Uploads"
				subtitle={
					selectedProfile
						? `${selectedProfile.name} profile is active. Pick a destination bucket, stage files from this device, and queue a transfer job with the current selection.`
						: 'Pick a destination bucket, stage files from this device, and queue a transfer job with the current selection.'
				}
				actions={
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
				}
			/>

			{isOffline ? <Alert type="warning" showIcon title="Offline: uploads are disabled." /> : null}
			{!uploadsSupported ? (
				<Alert type="info" showIcon title="Uploads are not available for this provider" description={uploadsUnsupportedReason} />
			) : null}

			{showBucketsEmpty ? (
				<PageSection
					title="Destination bucket required"
					description="Uploads are queued against a bucket. Create a bucket first, then return here to select the destination prefix."
				>
					<Empty description="No buckets available">
						<LinkButton to="/buckets">Go to Buckets</LinkButton>
					</Empty>
				</PageSection>
			) : null}

			{bucketsQuery.isError ? (
				<Alert type="error" showIcon title="Failed to load buckets" description={formatErr(bucketsQuery.error)} />
			) : null}

			{!showBucketsEmpty ? (
				<>
					<PageSection
						title="Target & source"
						description="Choose the bucket and optional prefix, then decide whether this selection should treat the source as individual files or a whole folder tree."
						actions={<Typography.Text type="secondary">{destinationLabel}</Typography.Text>}
					>
						<div className={styles.controlsGrid}>
							<label className={styles.fieldBlock}>
								<span className={styles.fieldLabel}>Bucket</span>
								<DatalistInput
									value={bucket}
									onChange={setBucket}
									placeholder={bucketsQuery.isFetching && !bucketsQuery.data ? 'Loading buckets…' : 'Bucket…'}
									ariaLabel="Bucket"
									allowClear
									className={styles.bucketField}
									disabled={isOffline || !uploadsSupported || (bucketsQuery.isFetching && !bucketsQuery.data)}
									options={bucketOptions.map((opt) => ({ value: opt.value, label: opt.label }))}
								/>
							</label>
							<label className={styles.fieldBlock}>
								<span className={styles.fieldLabel}>Prefix</span>
								<Input
									placeholder="prefix (optional)…"
									className={styles.prefixField}
									aria-label="Upload prefix (optional)"
									value={prefix}
									onChange={(e) => setPrefix(e.target.value)}
									disabled={isOffline || !uploadsSupported}
								/>
							</label>
							<div className={styles.modeCard}>
								<div>
									<Typography.Text strong>Folder mode</Typography.Text>
									<Typography.Paragraph className={styles.modeHint}>
										Keep directory structure when selecting a folder from this device.
									</Typography.Paragraph>
								</div>
								<div className={styles.switchRow}>
									<Typography.Text type="secondary">{folderMode ? 'Folder' : 'Files'}</Typography.Text>
									<Switch
										checked={folderMode}
										onChange={setFolderMode}
										disabled={isOffline || !uploadsSupported}
										aria-label="Folder mode"
									/>
								</div>
							</div>
						</div>
					</PageSection>

					<PageSection
						title="Selection"
						description={
							folderMode
								? 'Choose a folder to preserve relative paths. The queue will upload every file under that root.'
								: 'Choose one or more files from this device. You can review the first few items before queuing.'
						}
					>
						<div className={styles.selectionStack}>
							<div className={styles.selectionActions}>
								<Upload
									multiple
									directory={folderMode}
									beforeUpload={() => false}
									fileList={fileList}
									showUploadList={false}
									onChange={({ fileList: next }) => setFileList(next)}
									disabled={isOffline || !uploadsSupported}
								>
									<Button icon={<UploadOutlined />} disabled={isOffline || !uploadsSupported} size="large">
										{folderMode ? 'Select folder' : 'Select files'}
									</Button>
								</Upload>
								<Typography.Text type="secondary" className={styles.selectionHint}>
									{queueDisabledReason ?? 'Ready to queue this selection.'}
								</Typography.Text>
							</div>

							<div className={styles.summaryGrid}>
								<div className={styles.summaryCard}>
									<span className={styles.summaryLabel}>Selection</span>
									<strong className={styles.summaryValue}>{selectedFileCount.toLocaleString()} item(s)</strong>
								</div>
								<div className={styles.summaryCard}>
									<span className={styles.summaryLabel}>Total size</span>
									<strong className={styles.summaryValue}>{formatBytes(selectedTotalBytes)}</strong>
								</div>
								<div className={styles.summaryCard}>
									<span className={styles.summaryLabel}>Destination</span>
									<strong className={styles.summaryValue}>{destinationLabel}</strong>
								</div>
							</div>

							{previewFiles.length > 0 ? (
								<div className={styles.previewWrap}>
									<ul className={styles.previewList}>
										{previewFiles.map((file) => (
											<li key={`${file.name}-${file.size}`} className={styles.previewItem}>
												<div className={styles.previewName}>{file.name}</div>
												<div className={styles.previewMeta}>{formatBytes(file.size)}</div>
											</li>
										))}
									</ul>
									{remainingPreviewCount > 0 ? (
										<Typography.Text type="secondary">+ {remainingPreviewCount.toLocaleString()} more item(s) selected</Typography.Text>
									) : null}
								</div>
							) : (
								<div className={styles.emptyPreview}>
									<Typography.Text strong>{folderMode ? 'No folder selected.' : 'No files selected.'}</Typography.Text>
									<Typography.Text type="secondary">
										Select {folderMode ? 'a folder' : 'files'} to preview the queue contents before creating a job.
									</Typography.Text>
								</div>
							)}
						</div>
					</PageSection>
				</>
			) : null}
		</div>
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

function getRelativePathLabel(file: File): string {
	const fileWithPath = file as File & { webkitRelativePath?: string; relativePath?: string }
	return (fileWithPath.relativePath ?? fileWithPath.webkitRelativePath ?? file.name).trim() || file.name
}

// formatErr lives in ../lib/errors
