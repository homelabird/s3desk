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
		<Space.Compact className={styles.fullWidth}>
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
		</Space.Compact>
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
						<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials.
					</Typography.Paragraph>
				</FormField>

				<FormField label="Selected Profile" extra="Used by most pages to scope S3 operations.">
					<Space.Compact className={styles.fullWidth}>
						<Input value={props.profileId ?? ''} placeholder="(none)…" readOnly />
						<Button danger onClick={() => props.setProfileId(null)}>
							Clear
						</Button>
					</Space.Compact>
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
