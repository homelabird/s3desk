import { Button, Collapse, Input, Space, Typography } from 'antd'
import { useState } from 'react'

import { FormField } from '../../components/FormField'
import { appFeedback } from '../../lib/appFeedback'
import { getHttpHeaderValueValidationError } from '../../lib/httpHeaderValue'
import styles from '../SettingsPage.module.css'

type AccessSettingsSectionProps = {
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	apiDocsUrl: string
	openapiUrl: string
}

function ApiTokenField(props: { apiToken: string; inputId: string; setApiToken: (v: string) => void }) {
	const [draft, setDraft] = useState(props.apiToken)
	const apply = () => {
		const trimmed = draft.trim()
		const error = getHttpHeaderValueValidationError('API token', trimmed)
		if (error) {
			appFeedback.error(error)
			return
		}
		props.setApiToken(trimmed)
	}
	return (
		<div className={styles.compactFieldRow}>
			<Input.Password
				id={props.inputId}
				placeholder="Must match API_TOKEN…"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
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
			<div className={styles.accessCard}>
				<div className={styles.accessCardHeader}>
					<Typography.Text strong>Recommended first</Typography.Text>
					<Typography.Text type="secondary">Set the browser API token and confirm the active profile before using the rest of the app.</Typography.Text>
				</div>
				<Typography.Text type="secondary" className={styles.sectionIntro}>
					What this affects: browser access to this S3Desk server, the active storage profile, and API reference links.
				</Typography.Text>
				<FormField label="Backend API Token (X-Api-Token)" htmlFor="settings-api-token">
					<ApiTokenField
						key={props.apiToken}
						apiToken={props.apiToken}
						inputId="settings-api-token"
						setApiToken={props.setApiToken}
					/>
					<Typography.Paragraph type="secondary" className={styles.paragraphTop8}>
						This must match the server's <Typography.Text code>API_TOKEN</Typography.Text> (or{' '}
						<Typography.Text code>--api-token</Typography.Text>). It is not related to S3 credentials and is stored only for the current browser session.
					</Typography.Paragraph>
				</FormField>

				<FormField label="Selected Profile" htmlFor="settings-selected-profile" extra="Change or clear the active profile from the header profile selector or Profiles page.">
					<Input id="settings-selected-profile" value={props.profileId ?? ''} placeholder="(none)…" readOnly />
				</FormField>
			</div>

			<div className={styles.accessReferenceCard}>
				<div className={styles.accessCardHeader}>
					<Typography.Text strong>Reference only</Typography.Text>
					<Typography.Text type="secondary">Use these links when you need schema or endpoint details. They are not part of the main setup flow.</Typography.Text>
				</div>
				<Collapse
					size="small"
					items={[
						{
							key: 'advanced',
							label: 'API reference',
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
			</div>
		</Space>
	)
}
