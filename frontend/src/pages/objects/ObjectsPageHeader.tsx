import { Alert, Typography } from 'antd'
import { Suspense } from 'react'

import { UploadSourceSheet } from '../../components/UploadSourceSheet'
import styles from './ObjectsShell.module.css'
import { ObjectsToolbarSection } from './objectsPageLazy'

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
			<Typography.Title level={2} style={{ margin: 0 }}>
				Objects
			</Typography.Title>
			{!uploadSupported ? (
				<Alert
					type="info"
					showIcon
					title="Uploads are disabled for this provider"
					description={uploadDisabledReason ?? 'Object uploads are not supported by the selected provider.'}
				/>
			) : null}

			<Suspense fallback={toolbarFallback}>
				<ObjectsToolbarSection {...toolbarSectionProps} />
			</Suspense>
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
