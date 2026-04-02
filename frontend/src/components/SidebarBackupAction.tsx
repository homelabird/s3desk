import { CloudDownloadOutlined } from '@ant-design/icons'
import { Tag } from 'antd'
import { message } from 'antd'
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react'
import { Typography } from 'antd'

import type { APIClient } from '../api/client'
import type { MetaResponse, ServerRestoreResponse } from '../api/types'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { OverlaySheet } from './OverlaySheet'
import { SidebarBackupExportSection } from './SidebarBackupExportSection'
import { SidebarPortableImportSection } from './SidebarPortableImportSection'
import { SidebarRestoreBundleSection } from './SidebarRestoreBundleSection'
import { SidebarStagedRestoresSection } from './SidebarStagedRestoresSection'
import { useRestoreStaging } from './useRestoreStaging'
import { useSidebarBackupOperations } from './useSidebarBackupOperations'
import styles from './SidebarBackupAction.module.css'

type SidebarBackupActionProps = {
	api: APIClient
	meta?: MetaResponse
	onActionComplete?: () => void
	scopeKey?: string
}

export function SidebarBackupAction(props: SidebarBackupActionProps) {
	const sessionKey = props.scopeKey ?? '__default__'
	return <SidebarBackupActionSession key={sessionKey} {...props} />
}

function SidebarBackupActionSession(props: SidebarBackupActionProps) {
	const [open, setOpen] = useState(false)
	const restoreResultRef = useRef<Dispatch<SetStateAction<ServerRestoreResponse | null>> | null>(null)

	const {
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
	} = useRestoreStaging({
		api: props.api,
		open,
		metaLoaded: !!props.meta,
		onRestoreDeleted: (restoreId) => {
			restoreResultRef.current?.((current) => {
				if (!current) return current
				if (restoreId === '__stale_cleanup__') return current
				return current.stagingDir.endsWith(`/${restoreId}`) ? null : current
			})
		},
	})

	const {
		backupScope,
		setBackupScope,
		backupProtection,
		setBackupProtection,
		backupPassword,
		setBackupPassword,
		backupPasswordConfirm,
		setBackupPasswordConfirm,
		backupScopeAvailability,
		backupSupported,
		backupTagLabel,
		backupExportNotice,
		triggerSubtitle,
		exportSummary,
		protectionSummary,
		backupEncryptionAvailable,
		backupExportCapability,
		restoreStagingCapability,
		loadingScope,
		errorMessage,
		handleDownload,
		restoreLoading,
		restoreError,
		restorePassword,
		setRestorePassword,
		restoreResult,
		setRestoreResult,
		restoreValidation,
		handleRestoreFileSelect,
		portableLoading,
		portableError,
		portablePassword,
		portableImportResult,
		handlePortablePasswordChange,
		portableSummary,
		portablePreviewReady,
		handlePortablePreviewFileSelect,
		handlePortableImport,
		resetAsyncState,
	} = useSidebarBackupOperations({
		api: props.api,
		meta: props.meta,
		onActionComplete: props.onActionComplete,
		refreshStagedRestores,
	})

	useEffect(() => {
		restoreResultRef.current = setRestoreResult
	}, [setRestoreResult])

	const handleCloseDrawer = () => {
		resetAsyncState()
		resetRestoreInventoryState()
		setOpen(false)
	}

	const handleCopy = async (label: string, text: string) => {
		try {
			await copyToClipboard(text)
			message.success(`${label} copied.`)
		} catch (err) {
			void err
			message.error(clipboardFailureHint())
		}
	}

	const staleRestoreCount = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).length

	return (
		<>
			<button
				type="button"
				className={styles.trigger}
				onClick={() => setOpen(true)}
				aria-label="Backup"
				aria-expanded={open}
				aria-haspopup="dialog"
			>
				<span className={styles.triggerIcon} aria-hidden="true">
					<CloudDownloadOutlined />
				</span>
				<span className={styles.triggerCopy}>
					<span className={styles.triggerTitle}>Backup</span>
					<span className={styles.triggerSubtitle}>{triggerSubtitle}</span>
				</span>
			</button>
			<OverlaySheet
				open={open}
				onClose={handleCloseDrawer}
				title="Backup and restore"
				placement="right"
				width="min(92vw, 560px)"
				extra={
					<div className={styles.statusRow}>
						{backupSupported ? <Tag color="blue">{backupTagLabel}</Tag> : <Tag color="warning">{backupTagLabel}</Tag>}
						{staleRestoreCount > 0 ? <Tag color="warning">{staleRestoreCount} stale</Tag> : null}
					</div>
				}
			>
				<div className={styles.panel}>
					<div className={styles.panelHeader}>
						<Typography.Text type="secondary">
							Use this drawer for backup export, restore staging, portable migration, and staged restore cleanup.
						</Typography.Text>
					</div>
					<SidebarBackupExportSection
						backupScope={backupScope}
						setBackupScope={setBackupScope}
						backupScopeAvailability={backupScopeAvailability}
						backupExportNotice={backupExportNotice}
						exportSummary={exportSummary}
						backupProtection={backupProtection}
						setBackupProtection={setBackupProtection}
						backupEncryptionAvailable={backupEncryptionAvailable}
						backupPassword={backupPassword}
						setBackupPassword={setBackupPassword}
						backupPasswordConfirm={backupPasswordConfirm}
						setBackupPasswordConfirm={setBackupPasswordConfirm}
						protectionSummary={protectionSummary}
						loadingScope={loadingScope}
						backupSupported={backupSupported}
						backupExportCapabilityReason={backupExportCapability.reason}
						errorMessage={errorMessage}
						onDownload={handleDownload}
					/>
					<SidebarRestoreBundleSection
						restorePassword={restorePassword}
						setRestorePassword={setRestorePassword}
						restoreLoading={restoreLoading}
						restoreStagingCapabilityEnabled={restoreStagingCapability.enabled}
						restoreStagingCapabilityReason={restoreStagingCapability.reason || ''}
						restoreError={restoreError}
						restoreResult={restoreResult}
						restoreValidation={restoreValidation}
						onRestoreFileSelect={handleRestoreFileSelect}
						onCopy={handleCopy}
					/>
					<SidebarPortableImportSection
						portablePassword={portablePassword}
						onPortablePasswordChange={handlePortablePasswordChange}
						portableLoading={portableLoading}
						portablePreviewReady={portablePreviewReady}
						portableError={portableError}
						portableSummary={portableSummary}
						portableImportResultPresent={!!portableImportResult}
						onPortablePreviewFileSelect={handlePortablePreviewFileSelect}
						onPortableImport={handlePortableImport}
						onCopy={handleCopy}
					/>
					<SidebarStagedRestoresSection
						stagedRestores={stagedRestores}
						stagedRestoresLoading={stagedRestoresLoading}
						stagedRestoresError={stagedRestoresError}
						cleanupRestoresLoading={cleanupRestoresLoading}
						deleteRestoreId={deleteRestoreId}
						staleRestoreCount={staleRestoreCount}
						isRestoreStale={isRestoreStale}
						formatRestoreAge={formatRestoreAge}
						onRefresh={() => void refreshStagedRestores()}
						onDeleteStale={() => void handleDeleteStaleRestores()}
						onDeleteRestore={handleDeleteRestore}
						onCopy={handleCopy}
					/>
				</div>
			</OverlaySheet>
		</>
	)
}
