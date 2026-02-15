import { Button, Space, Typography } from 'antd'

import type { JobStatus } from '../../api/types'
import { formatBytes } from '../../lib/transfer'
import type { JobsUploadTableRow } from './jobsUploadTypes'

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
	if (uploadItemsCount === 0) {
		return <Typography.Text type="secondary">No file details recorded for this upload.</Typography.Text>
	}

	return (
		<>
			{uploadItemsTruncated ? (
				<Typography.Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
					Showing first {uploadItemsCount} of {uploadTotalFiles ?? uploadItemsCount} files.
				</Typography.Text>
			) : null}
			<div
				style={{
					border: `1px solid ${borderColor}`,
					borderRadius,
					overflow: 'hidden',
				}}
			>
				<table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, tableLayout: 'fixed' }}>
					<thead>
						<tr>
							<th
								style={{
									textAlign: 'left',
									padding: '8px 12px',
									borderBottom: `1px solid ${borderColor}`,
									background: backgroundColor,
									fontWeight: 600,
								}}
							>
								Path
							</th>
							<th
								style={{
									textAlign: 'right',
									padding: '8px 12px',
									borderBottom: `1px solid ${borderColor}`,
									background: backgroundColor,
									fontWeight: 600,
									width: 120,
								}}
							>
								Size
							</th>
							<th
								style={{
									textAlign: 'left',
									padding: '8px 12px',
									borderBottom: `1px solid ${borderColor}`,
									background: backgroundColor,
									fontWeight: 600,
									width: 220,
								}}
							>
								Hash
							</th>
						</tr>
					</thead>
					<tbody>
						{uploadTablePageItems.map((item) => (
							<tr key={item.key}>
								<td style={{ padding: '8px 12px', borderBottom: `1px solid ${borderColor}`, verticalAlign: 'middle' }}>
									<Typography.Text code>{item.path}</Typography.Text>
								</td>
								<td
									style={{
										padding: '8px 12px',
										borderBottom: `1px solid ${borderColor}`,
										verticalAlign: 'middle',
										textAlign: 'right',
										whiteSpace: 'nowrap',
									}}
								>
									{item.size != null ? formatBytes(item.size) : <Typography.Text type="secondary">-</Typography.Text>}
								</td>
								<td style={{ padding: '8px 12px', borderBottom: `1px solid ${borderColor}`, verticalAlign: 'middle' }}>
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
				<div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
					<Space size={8}>
						<Button size="small" disabled={uploadTablePageSafe <= 1} onClick={onUploadTablePrevPage}>
							Prev
						</Button>
						<Button size="small" disabled={uploadTablePageSafe >= uploadTableTotalPages} onClick={onUploadTableNextPage}>
							Next
						</Button>
					</Space>
					<Typography.Text type="secondary">
						Page {uploadTablePageSafe} / {uploadTableTotalPages}
					</Typography.Text>
				</div>
			) : null}
			{jobStatus !== 'succeeded' ? (
				<Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
					Hashes appear after the job completes.
				</Typography.Text>
			) : uploadHashFailures ? (
				<Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
					{uploadHashFailures} file(s) missing hash data.
				</Typography.Text>
			) : null}
		</>
	)
}
