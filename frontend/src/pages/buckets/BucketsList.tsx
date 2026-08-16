import { Typography } from 'antd'

import { useAppContentVirtualizer } from '../../components/useAppContentVirtualizer'
import { formatDateTime } from '../../lib/format'
import styles from '../BucketsPage.module.css'
import { BucketActions } from './BucketActions'

export type BucketsListProps = {
	buckets: { name: string; createdAt?: string | null }[]
	useCompactList: boolean
	policySupported: boolean
	policyUnsupportedReason: string
	controlsSupported: boolean
	controlsUnsupportedReason: string
	deletePending: boolean
	deletingBucket: string | null
	onOpenObjects: (bucketName: string) => void
	onOpenControls: (bucketName: string) => void
	onOpenPolicy: (bucketName: string) => void
	onDelete: (bucketName: string) => Promise<void>
}

export function BucketsList(props: BucketsListProps) {
	const { hostRef, items: virtualItems, measureElement, paddingBottom, paddingTop } =
		useAppContentVirtualizer(props.buckets.length, props.useCompactList ? 180 : 70)

	return (
		<div className={styles.tableWrap}>
			{props.useCompactList ? (
				<div
					ref={hostRef}
					className={styles.mobileList}
					data-testid="buckets-list-compact"
					role="list"
					aria-label="Buckets"
				>
					<div style={{ height: paddingTop }} aria-hidden />
					{virtualItems.map((item) => {
						const row = props.buckets[item.index]
						if (!row) return null
						return <article
							key={row.name}
							ref={measureElement}
							data-index={item.index}
							className={styles.mobileCard}
							role="listitem"
							aria-posinset={item.index + 1}
							aria-setsize={props.buckets.length}
						>
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
									onOpenObjects={props.onOpenObjects}
									onOpenControls={props.onOpenControls}
									onOpenPolicy={props.onOpenPolicy}
									onDelete={props.onDelete}
								/>
							</div>
						</article>
					})}
					<div style={{ height: paddingBottom }} aria-hidden />
				</div>
			) : (
				<div ref={hostRef} className={styles.desktopTable} data-testid="buckets-table-desktop">
					<table className={styles.table} aria-rowcount={props.buckets.length + 1}>
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
							{paddingTop > 0 ? <tr aria-hidden><td colSpan={3} style={{ height: paddingTop }} /></tr> : null}
							{virtualItems.map((item) => {
								const row = props.buckets[item.index]
								if (!row) return null
								return <tr
									key={row.name}
									ref={measureElement}
									data-index={item.index}
									aria-rowindex={item.index + 2}
									className={styles.tableRow}
								>
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
											onOpenObjects={props.onOpenObjects}
											onOpenControls={props.onOpenControls}
											onOpenPolicy={props.onOpenPolicy}
											onDelete={props.onDelete}
										/>
									</td>
								</tr>
							})}
							{paddingBottom > 0 ? <tr aria-hidden><td colSpan={3} style={{ height: paddingBottom }} /></tr> : null}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
