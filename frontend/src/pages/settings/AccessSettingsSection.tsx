import { Button, Collapse, Input, Space, Typography, message } from 'antd'
import { useState } from 'react'

import { FormField } from '../../components/FormField'
import { getHttpHeaderValueValidationError } from '../../lib/httpHeaderValue'
import styles from '../SettingsPage.module.css'

type AccessSettingsSectionProps = {
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	setProfileId: (v: string | null) => void
	apiDocsUrl: string
	openapiUrl: string
	dismissedDialogCount: number
	onResetDismissedDialogs: () => void
}

function ApiTokenField(props: { apiToken: string; setApiToken: (v: string) => void }) {
	const [draft, setDraft] = useState(props.apiToken)
	const apply = () => {
		const trimmed = draft.trim()
		const error = getHttpHeaderValueValidationError('API token', trimmed)
		if (error) {
			message.error(error)
			return
		}
		props.setApiToken(trimmed)
	}
	return (
		<div className={styles.compactFieldRow}>
			<Input.Password
				placeholder="Must match API_TOKEN…"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				onBlur={apply}
				onPressEnter={(e) => {
					e.preventDefault()
					apply()
				}}
				autoComplete="current-password"
			/>
			<Button type="primary" onClick={apply}>
				Apply
			</Button>
		</div>
	)
}

export function AccessSettingsSection(props: AccessSettingsSectionProps) {
	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<div>
				<FormField label="Backend API Token (X-Api-Token)">
					<ApiTokenField key={props.apiToken} apiToken={props.apiToken} setApiToken={props.setApiToken} />
					<Typography.Paragraph type="secondary" className={styles.paragraphTop8}>
						This must match the server's <Typography.Text code>API_TOKEN</Typography.Text> (or{' '}
						<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials and is stored only for the current browser session.
					</Typography.Paragraph>
				</FormField>

				<FormField label="Selected Profile" extra="Used by most pages to scope S3 operations.">
					<div className={styles.compactFieldRow}>
						<Input value={props.profileId ?? ''} placeholder="(none)…" readOnly />
						<Button danger onClick={() => props.setProfileId(null)}>
							Clear
						</Button>
					</div>
				</FormField>

				<FormField label="Dialog confirmations" extra="Controls confirmations or warnings you chose not to see again.">
					<Space orientation="vertical" size={8} className={styles.fullWidth}>
						<Typography.Text type="secondary">
							{props.dismissedDialogCount > 0
								? `${props.dismissedDialogCount} dialog preference(s) are currently suppressed.`
								: 'No dialog preferences are currently suppressed.'}
						</Typography.Text>
						<Button onClick={props.onResetDismissedDialogs} disabled={props.dismissedDialogCount === 0}>
							Reset dismissed dialogs
						</Button>
					</Space>
				</FormField>
			</div>

			<Collapse
				size="small"
				items={[
					{
						key: 'advanced',
						label: 'Advanced',
						children: (
							<Space orientation="vertical" size={4} className={styles.fullWidth}>
								<Typography.Text type="secondary">OpenAPI 3.0 spec and interactive docs.</Typography.Text>
								<Space wrap>
									<Button type="link" href={props.apiDocsUrl} target="_blank" rel="noopener noreferrer">
										Open API Docs (new tab)
									</Button>
									<Button type="link" href={props.openapiUrl} target="_blank" rel="noopener noreferrer">
										OpenAPI YAML (new tab)
									</Button>
								</Space>
							</Space>
						),
					},
				]}
			/>
		</Space>
	)
}
