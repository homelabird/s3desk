import { Typography } from 'antd'

import { formatDateTime } from '../../lib/format'
import styles from '../BucketsPage.module.css'
import { BucketActions } from './BucketActions'

type BucketsListProps = {
	buckets: { name: string; createdAt?: string | null }[]
	useCompactList: boolean
	policySupported: boolean
	policyUnsupportedReason: string
	controlsSupported: boolean
	controlsUnsupportedReason: string
	deletePending: boolean
	deletingBucket: string | null
	onOpenControls: (bucketName: string) => void
	onOpenPolicy: (bucketName: string) => void
	onDelete: (bucketName: string) => Promise<void>
}

export function BucketsList(props: BucketsListProps) {
	return (
		<div className={styles.tableWrap}>
			{props.useCompactList ? (
				<div className={styles.mobileList} data-testid="buckets-list-compact">
					{props.buckets.map((row) => (
						<article key={row.name} className={styles.mobileCard}>
							<Typography.Text strong className={styles.mobileCardTitle}>
								{row.name}
							</Typography.Text>
							<div className={styles.mobileMetaGrid}>
								<div>
									<div className={styles.metaLabel}>Created</div>
									<div className={styles.metaValue}>
										{row.createdAt ? formatDateTime(row.createdAt) : '-'}
									</div>
								</div>
								<div>
									<div className={styles.metaLabel}>Policy</div>
									<div className={styles.metaValue}>
										{props.policySupported ? 'Available' : 'Unsupported'}
									</div>
								</div>
							</div>
							<div className={styles.mobileActionRow}>
								<BucketActions
									bucketName={row.name}
									controlsSupported={props.controlsSupported}
									controlsUnsupportedReason={props.controlsUnsupportedReason}
									policySupported={props.policySupported}
									policyUnsupportedReason={props.policyUnsupportedReason}
									deleteLoading={props.deletePending && props.deletingBucket === row.name}
									onOpenControls={props.onOpenControls}
									onOpenPolicy={props.onOpenPolicy}
									onDelete={props.onDelete}
								/>
							</div>
						</article>
					))}
				</div>
			) : (
				<div className={styles.desktopTable} data-testid="buckets-table-desktop">
					<table className={styles.table}>
						<caption className="sr-only">List of buckets</caption>
						<thead>
							<tr className={styles.headRow}>
								<th scope="col" className={styles.th}>
									Name
								</th>
								<th scope="col" className={`${styles.th} ${styles.thCreated}`}>
									CreatedAt
								</th>
								<th scope="col" className={`${styles.th} ${styles.thActions}`}>
									Actions
								</th>
							</tr>
						</thead>
						<tbody>
							{props.buckets.map((row) => (
								<tr key={row.name} className={styles.tableRow}>
									<td className={styles.td}>
										<Typography.Text strong className={styles.bucketName}>
											{row.name}
										</Typography.Text>
									</td>
									<td className={styles.td}>
										{row.createdAt ? (
											<Typography.Text code title={row.createdAt}>
												{formatDateTime(row.createdAt)}
											</Typography.Text>
										) : (
											<Typography.Text type="secondary">-</Typography.Text>
										)}
									</td>
									<td className={styles.td}>
										<BucketActions
											bucketName={row.name}
											controlsSupported={props.controlsSupported}
											controlsUnsupportedReason={props.controlsUnsupportedReason}
											policySupported={props.policySupported}
											policyUnsupportedReason={props.policyUnsupportedReason}
											deleteLoading={props.deletePending && props.deletingBucket === row.name}
											onOpenControls={props.onOpenControls}
											onOpenPolicy={props.onOpenPolicy}
											onDelete={props.onDelete}
										/>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
