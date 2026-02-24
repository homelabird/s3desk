import { Alert, Typography } from 'antd'
import type { ChangeEventHandler, RefObject } from 'react'
import { Suspense } from 'react'

import styles from './objects.module.css'
import { ObjectsToolbarSection } from './objectsPageLazy'

type ObjectsToolbarSectionProps = Parameters<typeof import('./ObjectsToolbarSection').ObjectsToolbarSection>[0]

export type ObjectsPageHeaderProps = {
	uploadSupported: boolean
	uploadDisabledReason: string | null | undefined
	uploadFilesInputRef: RefObject<HTMLInputElement | null>
	onUploadFilesInputChange: ChangeEventHandler<HTMLInputElement>
	uploadFolderInputRef: RefObject<HTMLInputElement | null>
	onUploadFolderInputChange: ChangeEventHandler<HTMLInputElement>
	toolbarSectionProps: ObjectsToolbarSectionProps
}

export function ObjectsPageHeader({
	uploadSupported,
	uploadDisabledReason,
	uploadFilesInputRef,
	onUploadFilesInputChange,
	uploadFolderInputRef,
	onUploadFolderInputChange,
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

			<input
				ref={uploadFilesInputRef}
				type="file"
				multiple
				aria-label="Select files to upload"
				style={{ display: 'none' }}
				onChange={onUploadFilesInputChange}
			/>
			<input
				ref={uploadFolderInputRef}
				type="file"
				multiple
				aria-label="Select folder to upload"
				style={{ display: 'none' }}
				onChange={onUploadFolderInputChange}
			/>

			<Suspense fallback={toolbarFallback}>
				<ObjectsToolbarSection {...toolbarSectionProps} />
			</Suspense>
		</>
	)
}
