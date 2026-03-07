import { Button, Typography } from 'antd'
import type { CSSProperties } from 'react'

import type { JobStatus } from '../../api/types'
import { formatBytes } from '../../lib/transfer'
import type { JobsUploadTableRow } from './jobsUploadTypes'
import styles from './JobsShared.module.css'

type Props = {
	uploadItemsCount: number
	uploadItemsTruncated?: boolean
	uploadTotalFiles?: number
	uploadTablePageItems: JobsUploadTableRow[]
	uploadTableDataLength: number
	uploadTablePageSize: number
	uploadTablePageSafe: number
	uploadTableTotalPages: number
	onUploadTablePrevPage: () => void
	onUploadTableNextPage: () => void
	jobStatus: JobStatus
	uploadHashesLoading: boolean
	uploadHashFailures: number
	borderColor: string
	backgroundColor: string
	borderRadius: number
}

export function JobsUploadDetailsTable({
	uploadItemsCount,
	uploadItemsTruncated,
	uploadTotalFiles,
	uploadTablePageItems,
	uploadTableDataLength,
	uploadTablePageSize,
	uploadTablePageSafe,
	uploadTableTotalPages,
	onUploadTablePrevPage,
	onUploadTableNextPage,
	jobStatus,
	uploadHashesLoading,
	uploadHashFailures,
	borderColor,
	backgroundColor,
	borderRadius,
}: Props) {
	const tableVars = {
		'--jobs-upload-table-border': borderColor,
		'--jobs-upload-table-bg': backgroundColor,
		'--jobs-upload-table-radius': `${borderRadius}px`,
	} as CSSProperties

	if (uploadItemsCount === 0) {
		return <Typography.Text type="secondary">No file details recorded for this upload.</Typography.Text>
	}

	return (
		<>
			{uploadItemsTruncated ? (
				<Typography.Text type="secondary" className={styles.uploadTableNote}>
					Showing first {uploadItemsCount} of {uploadTotalFiles ?? uploadItemsCount} files.
				</Typography.Text>
			) : null}
			<div className={styles.uploadTableShell} style={tableVars}>
				<table className={styles.uploadTable}>
					<thead>
						<tr>
							<th className={styles.uploadTableHeadCell}>
								Path
							</th>
							<th className={`${styles.uploadTableHeadCell} ${styles.uploadTableHeadCellRight} ${styles.uploadTableSizeColumn}`}>
								Size
							</th>
							<th className={`${styles.uploadTableHeadCell} ${styles.uploadTableHashColumn}`}>
								Hash
							</th>
						</tr>
					</thead>
					<tbody>
						{uploadTablePageItems.map((item) => (
							<tr key={item.key}>
								<td className={styles.uploadTableCell}>
									<Typography.Text code>{item.path}</Typography.Text>
								</td>
								<td className={`${styles.uploadTableCell} ${styles.uploadTableCellRight}`}>
									{item.size != null ? formatBytes(item.size) : <Typography.Text type="secondary">-</Typography.Text>}
								</td>
								<td className={styles.uploadTableCell}>
									{jobStatus !== 'succeeded' ? (
										<Typography.Text type="secondary">Pending</Typography.Text>
									) : uploadHashesLoading ? (
										<Typography.Text type="secondary">Loading…</Typography.Text>
									) : item.etag ? (
										<Typography.Text code>{item.etag}</Typography.Text>
									) : (
										<Typography.Text type="secondary">-</Typography.Text>
									)}
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>
			{uploadTableDataLength > uploadTablePageSize ? (
				<div className={styles.uploadTablePagination}>
					<div className={styles.uploadTablePaginationActions}>
						<Button size="small" disabled={uploadTablePageSafe <= 1} onClick={onUploadTablePrevPage}>
							Prev
						</Button>
						<Button size="small" disabled={uploadTablePageSafe >= uploadTableTotalPages} onClick={onUploadTableNextPage}>
							Next
						</Button>
					</div>
					<Typography.Text type="secondary">
						Page {uploadTablePageSafe} / {uploadTableTotalPages}
					</Typography.Text>
				</div>
			) : null}
			{jobStatus !== 'succeeded' ? (
				<Typography.Text type="secondary" className={styles.uploadTableStatusNote}>
					Hashes appear after the job completes.
				</Typography.Text>
			) : uploadHashFailures ? (
				<Typography.Text type="secondary" className={styles.uploadTableStatusNote}>
					{uploadHashFailures} file(s) missing hash data.
				</Typography.Text>
			) : null}
		</>
	)
}
