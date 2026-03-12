import { Alert, Space, Typography } from 'antd'

import type { APIClient } from '../../api/client'
import type { MetaResponse } from '../../api/types'

type ServerSettingsSectionProps = {
	api: APIClient
	meta: MetaResponse | undefined
	isFetching: boolean
	errorMessage: string | null
}

export function ServerSettingsSection(props: ServerSettingsSectionProps) {
	void props.api
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
			<Alert
				type="info"
				showIcon
				title="Backup and restore moved to the sidebar"
				description="Use the main sidebar Backup action for backup export, restore staging, portable migration, and staged restore inventory. This legacy settings section is kept only for compatibility."
			/>
			<Typography.Text type="secondary">
				The Operations tab has been removed. Server backup and restore is now managed from the sidebar workflow so operators can stay in the main navigation context.
			</Typography.Text>
		</Space>
	)
}
