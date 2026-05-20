import { Tag, Typography } from 'antd'
import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react'

import type { APIClientShape } from '../api/client'
import type { MetaResponse, ServerRestoreResponse } from '../api/types'
import { appFeedback } from '../lib/appFeedback'
import { clipboardFailureHint, copyToClipboard } from '../lib/clipboard'
import { OverlaySheet } from './OverlaySheet'
import { SidebarBackupExportSection } from './SidebarBackupExportSection'
import { SidebarPortableImportSection } from './SidebarPortableImportSection'
import { SidebarRestoreBundleSection } from './SidebarRestoreBundleSection'
import { SidebarStagedRestoresSection } from './SidebarStagedRestoresSection'
import { useBackupDrawerState } from './useBackupDrawerState'
import { useStagedRestoreInventory } from './useStagedRestoreInventory'
import styles from './SidebarBackupAction.module.css'

export type SidebarBackupDrawerProps = {
	api: APIClientShape
	meta?: MetaResponse
	open: boolean
	sheetId?: string
	onActionComplete?: () => void
	onClose: () => void
}

export function SidebarBackupDrawer(props: SidebarBackupDrawerProps) {
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
		resetStagedRestoreInventoryState,
	} = useStagedRestoreInventory({
		api: props.api,
		open: props.open,
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
		resetBackupDrawerAsyncState,
	} = useBackupDrawerState({
		api: props.api,
		meta: props.meta,
		onActionComplete: props.onActionComplete,
		refreshStagedRestores,
	})

	useEffect(() => {
		restoreResultRef.current = setRestoreResult
	}, [setRestoreResult])

	const handleCloseDrawer = () => {
		resetBackupDrawerAsyncState()
		resetStagedRestoreInventoryState()
		props.onClose()
	}

	const handleCopy = async (label: string, text: string) => {
		try {
			await copyToClipboard(text)
			appFeedback.success(`${label} copied.`)
		} catch (err) {
			void err
			appFeedback.error(clipboardFailureHint())
		}
	}

	const staleRestoreCount = stagedRestores.filter((item) => isRestoreStale(item.stagedAt)).length

	return (
		<OverlaySheet
			open={props.open}
			onClose={handleCloseDrawer}
			title="Backup and restore"
			placement="right"
			width="min(92vw, 560px)"
			sheetId={props.sheetId}
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
	)
}
