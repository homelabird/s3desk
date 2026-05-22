import { Alert, Space, Typography } from 'antd'

import type { APIClientShape } from '../../api/client'
import type { MetaResponse } from '../../api/types'
import { SidebarBackupAction } from '../../components/SidebarBackupAction'

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
			<Space orientation="vertical" size={8} style={{ width: '100%' }}>
				<Typography.Text strong>Backup and restore</Typography.Text>
				<Typography.Text type="secondary">
					Use these server tools only when moving, restoring, or cleaning up this S3Desk instance.
				</Typography.Text>
				<SidebarBackupAction
					api={props.api}
					meta={props.meta}
					scopeKey={props.scopeKey}
					variant="surface"
				/>
			</Space>
			<Typography.Text type="secondary">
				They affect local server state. Keep day-to-day browsing, uploads, and transfers in the main workspace.
			</Typography.Text>
		</Space>
	)
}
