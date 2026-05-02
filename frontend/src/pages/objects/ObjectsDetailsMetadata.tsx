import { Descriptions, Typography } from 'antd'

import type { ObjectMeta } from '../../api/types'
import { formatDateTime } from '../../lib/format'
import { formatBytes } from '../../lib/transfer'
import styles from './ObjectsDetails.module.css'

type ObjectsDetailsMetadataProps = {
	detailsMeta: ObjectMeta
}

export function ObjectsDetailsMetadata({ detailsMeta }: ObjectsDetailsMetadataProps) {
	return (
		<>
			<Descriptions size="small" bordered column={1} className={styles.detailsPrimaryDescriptions}>
				<Descriptions.Item label="Key">
					<Typography.Text code>{detailsMeta.key}</Typography.Text>
				</Descriptions.Item>
				<Descriptions.Item label="Size">
					{typeof detailsMeta.size === 'number' && Number.isFinite(detailsMeta.size) ? (
						formatBytes(detailsMeta.size)
					) : (
						<Typography.Text type="secondary">-</Typography.Text>
					)}
				</Descriptions.Item>
				<Descriptions.Item label="ETag">
					{detailsMeta.etag ? <Typography.Text code>{detailsMeta.etag}</Typography.Text> : <Typography.Text type="secondary">-</Typography.Text>}
				</Descriptions.Item>
				<Descriptions.Item label="Last Modified">
					{detailsMeta.lastModified ? (
						<Typography.Text code>{formatDateTime(detailsMeta.lastModified, { showSeconds: false })}</Typography.Text>
					) : (
						<Typography.Text type="secondary">-</Typography.Text>
					)}
				</Descriptions.Item>
				<Descriptions.Item label="Content Type">
					{detailsMeta.contentType ? (
						<Typography.Text code>{detailsMeta.contentType}</Typography.Text>
					) : (
						<Typography.Text type="secondary">-</Typography.Text>
					)}
				</Descriptions.Item>
			</Descriptions>

			{detailsMeta.metadata && Object.keys(detailsMeta.metadata).length ? (
				<Descriptions size="small" bordered column={1} title="Metadata" className={styles.detailsMetadataDescriptions}>
					{Object.entries(detailsMeta.metadata).map(([key, value]) => (
						<Descriptions.Item key={key} label={key}>
							<Typography.Text code>{value}</Typography.Text>
						</Descriptions.Item>
					))}
				</Descriptions>
			) : (
				<Typography.Text type="secondary">No user metadata</Typography.Text>
			)}
		</>
	)
}
