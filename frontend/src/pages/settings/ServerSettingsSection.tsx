import { Alert, Descriptions, Space, Typography } from 'antd'

import type { APIClientShape } from '../../api/client'
import type { MetaResponse } from '../../api/types'
import { SidebarBackupAction } from '../../components/SidebarBackupAction'
import { formatBytes, formatDurationSeconds } from '../../lib/transfer'

type ServerSettingsSectionProps = {
	api: APIClientShape
	meta: MetaResponse | undefined
	scopeKey?: string
	isFetching?: boolean
	errorMessage?: string | null
}

export function ServerSettingsSection(props: ServerSettingsSectionProps) {
	void props.isFetching

	const warnings = Array.isArray(props.meta?.warnings)
		? props.meta.warnings.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
		: []

	return (
		<Space orientation="vertical" size="middle" style={{ width: '100%' }}>
			{props.errorMessage ? <Alert type="error" showIcon title="Failed to load server backup state" description={props.errorMessage} /> : null}
			{warnings.length > 0 ? (
				<Alert
					type="warning"
					showIcon
					title="Operational warnings"
					description={<ul>{warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul>}
				/>
			) : null}
			{props.meta ? (
				<>
					<Typography.Text strong>Runtime diagnostics</Typography.Text>
					<Descriptions bordered size="small" column={1}>
						<Descriptions.Item label="Server version">{props.meta.version}</Descriptions.Item>
						<Descriptions.Item label="Database">{props.meta.dbBackend}</Descriptions.Item>
						<Descriptions.Item label="API authentication">{props.meta.apiTokenEnabled ? 'Enabled' : 'Disabled'}</Descriptions.Item>
						<Descriptions.Item label="Credential encryption">{props.meta.encryptionEnabled ? 'Enabled' : 'Disabled'}</Descriptions.Item>
						<Descriptions.Item label="Transfer engine">
							{props.meta.transferEngine.available && props.meta.transferEngine.compatible
								? `${props.meta.transferEngine.name} ${props.meta.transferEngine.version ?? ''}`.trim()
								: 'Unavailable or incompatible'}
						</Descriptions.Item>
						<Descriptions.Item label="Job concurrency">{props.meta.jobConcurrency}</Descriptions.Item>
						<Descriptions.Item label="Job log limit">
							{props.meta.jobLogMaxBytes ? formatBytes(props.meta.jobLogMaxBytes) : 'Unlimited'}
						</Descriptions.Item>
						<Descriptions.Item label="Job log retention">
							{props.meta.jobLogRetentionSeconds ? formatDurationSeconds(props.meta.jobLogRetentionSeconds) : 'Keep forever'}
						</Descriptions.Item>
						<Descriptions.Item label="Upload mode">{props.meta.uploadDirectStream ? 'Direct stream' : 'Server staging'}</Descriptions.Item>
					</Descriptions>
				</>
			) : (
				<Typography.Text type="secondary">Runtime diagnostics are unavailable until server metadata loads.</Typography.Text>
			)}
			<SidebarBackupAction api={props.api} meta={props.meta} scopeKey={props.scopeKey} variant="surface" />
		</Space>
	)
}
