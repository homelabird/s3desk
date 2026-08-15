import { Alert, Typography } from 'antd'
import { Suspense } from 'react'

import { UploadSourceSheet } from '../../components/UploadSourceSheet'
import { uploadsUnsupportedHint } from '../../lib/actionHints'
import styles from './ObjectsShell.module.css'
import { ObjectsToolbarSection } from './objectsToolbarLazy'

type ObjectsToolbarSectionProps = Parameters<typeof import('./ObjectsToolbarSection').ObjectsToolbarSection>[0]

export type ObjectsPageHeaderProps = {
	uploadSupported: boolean
	uploadDisabledReason: string | null | undefined
	uploadSourceOpen: boolean
	uploadSourceBusy: boolean
	folderSelectionSupported: boolean
	folderSelectionReason: string | null
	onCloseUploadSource: () => void
	onSelectUploadFiles: () => void
	onSelectUploadFolder: () => void
	toolbarSectionProps: ObjectsToolbarSectionProps
}

export function ObjectsPageHeader({
	uploadSupported,
	uploadDisabledReason,
	uploadSourceOpen,
	uploadSourceBusy,
	folderSelectionSupported,
	folderSelectionReason,
	onCloseUploadSource,
	onSelectUploadFiles,
	onSelectUploadFolder,
	toolbarSectionProps,
}: ObjectsPageHeaderProps) {
	const toolbarFallback = (
		<div className={styles.toolbarSkeleton}>
			<Typography.Text type="secondary">Loading toolbar…</Typography.Text>
		</div>
	)

	return (
		<>
			<div className={styles.pageHeader} data-testid="objects-page-header">
				<Typography.Title level={1} className={styles.pageTitle}>
					Objects
				</Typography.Title>
				{!uploadSupported ? (
					<Alert
						type="info"
						showIcon
						title="Uploads are disabled for this provider"
						description={uploadDisabledReason ?? uploadsUnsupportedHint()}
						className={styles.pageHeaderAlert}
					/>
				) : null}

				<Suspense fallback={toolbarFallback}>
					<ObjectsToolbarSection {...toolbarSectionProps} />
				</Suspense>
			</div>
			<UploadSourceSheet
				open={uploadSourceOpen}
				title="Upload to this location"
				folderSelectionSupported={folderSelectionSupported}
				folderSelectionReason={folderSelectionReason ?? undefined}
				busy={uploadSourceBusy}
				onClose={onCloseUploadSource}
				onSelectFiles={onSelectUploadFiles}
				onSelectFolder={onSelectUploadFolder}
			/>
		</>
	)
}
