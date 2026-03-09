import { useQuery } from '@tanstack/react-query'
import { Alert, Button, Empty, Input, Space, Tooltip, Typography, message } from 'antd'
import { useMemo, useState } from 'react'

import { APIClient } from '../api/client'
import type { Bucket, Profile } from '../api/types'
import { DatalistInput } from '../components/DatalistInput'
import { LinkButton } from '../components/LinkButton'
import { PageHeader } from '../components/PageHeader'
import { PageSection } from '../components/PageSection'
import { SetupCallout } from '../components/SetupCallout'
import { ToggleSwitch } from '../components/ToggleSwitch'
import { useTransfers } from '../components/useTransfers'
import { formatErrorWithHint as formatErr } from '../lib/errors'
import { getProviderCapabilities, getUploadCapabilityDisabledReason } from '../lib/providerCapabilities'
import { useIsOffline } from '../lib/useIsOffline'
import { useLocalStorageState } from '../lib/useLocalStorageState'
import styles from './UploadsPage.module.css'
import { UploadsSelectionSection } from './uploads/UploadsSelectionSection'

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
	const [selectedFiles, setSelectedFiles] = useState<File[]>([])

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
		return profilesQuery.data?.find((profile) => profile.id === props.profileId) ?? null
	}, [profilesQuery.data, props.profileId])

	const profileCapabilities = selectedProfile?.provider
		? getProviderCapabilities(selectedProfile.provider, metaQuery.data?.capabilities?.providers, selectedProfile)
		: null
	const uploadsSupported = profileCapabilities ? profileCapabilities.objectCrud && profileCapabilities.jobTransfer : true
	const uploadsUnsupportedReason = getUploadCapabilityDisabledReason(profileCapabilities)

	const bucketsQuery = useQuery({
		queryKey: ['buckets', props.profileId, props.apiToken],
		queryFn: () => api.listBuckets(props.profileId!),
		enabled: !!props.profileId,
	})

	const selectedFileCount = selectedFiles.length
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

	const bucketOptions = (bucketsQuery.data ?? []).map((entry: Bucket) => ({ label: entry.name, value: entry.name }))
	const showBucketsEmpty = bucketsQuery.isFetched && bucketOptions.length === 0
	const canQueueUpload = !isOffline && uploadsSupported && !!bucket && selectedFiles.length > 0
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
		if (selectedFiles.length === 0) {
			message.info(folderMode ? 'Select a folder first' : 'Select files first')
			return
		}
		transfers.queueUploadFiles({ profileId: props.profileId!, bucket, prefix, files: selectedFiles })
		setSelectedFiles([])
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
						<Button onClick={() => transfers.openTransfers('uploads')} disabled={!props.profileId}>
							Open Transfers
						</Button>
						<Button onClick={() => setSelectedFiles([])} disabled={selectedFiles.length === 0}>
							Clear selection
						</Button>
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
									options={bucketOptions.map((option) => ({ value: option.value, label: option.label }))}
								/>
							</label>
							<label className={styles.fieldBlock}>
								<span className={styles.fieldLabel}>Prefix</span>
								<Input
									placeholder="prefix (optional)…"
									className={styles.prefixField}
									aria-label="Upload prefix (optional)"
									value={prefix}
									onChange={(event) => setPrefix(event.target.value)}
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
									<ToggleSwitch
										checked={folderMode}
										onChange={(checked) => {
											setFolderMode(checked)
											setSelectedFiles([])
										}}
										disabled={isOffline || !uploadsSupported}
										aria-label="Folder mode"
									/>
								</div>
							</div>
						</div>
					</PageSection>

					<UploadsSelectionSection
						folderMode={folderMode}
						onFilesChange={setSelectedFiles}
						isOffline={isOffline}
						uploadsSupported={uploadsSupported}
						queueDisabledReason={queueDisabledReason}
						selectedFiles={selectedFiles}
						destinationLabel={destinationLabel}
					/>
				</>
			) : null}
		</div>
	)
}
