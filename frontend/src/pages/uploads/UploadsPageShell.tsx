import { Alert, Button, Empty, Input, Space, Tooltip, Typography } from 'antd'

import { DatalistInput } from '../../components/DatalistInput'
import { LinkButton } from '../../components/LinkButton'
import { PageHeader } from '../../components/PageHeader'
import { PageSection } from '../../components/PageSection'
import { UploadSourceSheet } from '../../components/UploadSourceSheet'
import { failedToLoadBucketsTitle, goToBucketsLabel, noBucketsAvailableHint, offlineUploadsDisabledHint } from '../../lib/actionHints'
import styles from '../UploadsPage.module.css'
import { UploadsSelectionSection } from './UploadsSelectionSection'
import type { UploadsPagePresentationProps } from './buildUploadsPagePresentationProps'

export type UploadsPageShellProps = {
	presentation: UploadsPagePresentationProps
}

export function UploadsPageShell(props: UploadsPageShellProps) {
	const { presentation } = props
	const hasSelection = !presentation.header.clearSelectionDisabled
	const headerActions = hasSelection ? (
		<Space wrap className={styles.headerActions}>
			<Tooltip title={presentation.header.queueButtonTooltip}>
				<span>
					<Button
						type="primary"
						onClick={presentation.header.onQueueUpload}
						disabled={presentation.header.queueButtonDisabled}
					>
						{presentation.header.queueButtonLabel}
					</Button>
				</span>
			</Tooltip>
			<Button onClick={presentation.header.onOpenTransfers}>Open Transfers</Button>
			<Button onClick={presentation.header.onClearSelection}>Clear selection</Button>
		</Space>
	) : null

	return (
		<div className={styles.pageStack}>
			<PageHeader
				eyebrow="Transfer"
				title="Uploads"
				subtitle={presentation.header.subtitle}
				actions={headerActions}
			/>

			{presentation.alerts.showOffline ? <Alert type="warning" showIcon title={offlineUploadsDisabledHint()} /> : null}
			{presentation.alerts.showUnsupported ? (
				<Alert
					type="info"
					showIcon
					title="Uploads are not available for this provider"
					description={presentation.alerts.unsupportedDescription}
				/>
			) : null}

			{presentation.emptyState.showBucketsEmpty ? (
				<PageSection
					title="Destination bucket required"
					description="Create a bucket first, then return here to choose the destination prefix."
				>
					<Empty description={noBucketsAvailableHint()}>
						<LinkButton to="/buckets">{goToBucketsLabel()}</LinkButton>
					</Empty>
				</PageSection>
			) : null}

			{presentation.alerts.bucketsErrorDescription ? (
				<Alert type="error" showIcon title={failedToLoadBucketsTitle()} description={presentation.alerts.bucketsErrorDescription} />
			) : null}

			{presentation.targetSource.show ? (
				<>
					<UploadsSelectionSection {...presentation.selection} />

					<PageSection
						title="Target & source"
						description="Choose where this selection will be uploaded. Bucket is required before queueing."
						actions={
							<Typography.Text type="secondary" className={styles.destinationLabel}>
								{presentation.targetSource.destinationLabel}
							</Typography.Text>
						}
					>
						<div className={styles.controlsGrid}>
							<label className={styles.fieldBlock}>
								<span className={styles.fieldLabel}>Bucket</span>
								<DatalistInput
									value={presentation.targetSource.bucketValue}
									onChange={presentation.targetSource.onBucketChange}
									placeholder={presentation.targetSource.bucketPlaceholder}
									ariaLabel="Bucket"
									allowClear
									className={styles.bucketField}
									disabled={presentation.targetSource.bucketDisabled}
									options={presentation.targetSource.bucketOptions}
								/>
							</label>
							<label className={styles.fieldBlock}>
								<span className={styles.fieldLabel}>Prefix</span>
								<Input
									placeholder="prefix (optional)…"
									className={styles.prefixField}
									aria-label="Upload prefix (optional)"
									value={presentation.targetSource.prefixValue}
									onChange={(event) => presentation.targetSource.onPrefixChange(event.target.value)}
									disabled={presentation.targetSource.prefixDisabled}
								/>
							</label>
						</div>
					</PageSection>
				</>
			) : null}
			<UploadSourceSheet {...presentation.uploadSourceSheet} />
		</div>
	)
}
