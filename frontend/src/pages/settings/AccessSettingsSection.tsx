import { Button, Collapse, Input, Space, Typography } from 'antd'
import { useState } from 'react'

import { FormField } from '../../components/FormField'
import { getHttpHeaderValueValidationError } from '../../lib/httpHeaderValue'
import styles from '../SettingsPage.module.css'

type AccessSettingsSectionProps = {
	apiToken: string
	setApiToken: (v: string) => void
	profileId: string | null
	profileName: string | null
	apiDocsUrl: string
	openapiUrl: string
}

function ApiTokenField(props: { apiToken: string; inputId: string; setApiToken: (v: string) => void }) {
	const [draft, setDraft] = useState(props.apiToken)
	const [validationError, setValidationError] = useState<string | null>(null)
	const hasChanges = draft.trim() !== props.apiToken
	const apply = () => {
		if (!hasChanges) return
		const trimmed = draft.trim()
		const error = getHttpHeaderValueValidationError('API token', trimmed)
		if (error) {
			setValidationError(error)
			return
		}
		props.setApiToken(trimmed)
	}
	return (
		<FormField label="API token" htmlFor={props.inputId} error={validationError}>
			<div className={styles.compactFieldRow}>
				<Input.Password
					id={props.inputId}
					placeholder="Must match API_TOKEN…"
					value={draft}
					onChange={(e) => {
						setDraft(e.target.value)
						setValidationError(null)
					}}
					onPressEnter={(e) => {
						e.preventDefault()
						apply()
					}}
					autoComplete="current-password"
					status={validationError ? 'error' : undefined}
					aria-invalid={validationError ? true : undefined}
					aria-describedby={validationError ? `${props.inputId}-error` : undefined}
				/>
				<Button type="primary" onClick={apply} disabled={!hasChanges}>
					Apply
				</Button>
			</div>
			{hasChanges && !validationError ? (
				<Typography.Paragraph type="warning" role="status" className={`${styles.paragraphTop8} ${styles.marginBottom0}`}>
					Unapplied token change. Select Apply to reconnect.
				</Typography.Paragraph>
			) : null}
			<Typography.Paragraph type="secondary" className={styles.paragraphTop8}>
				Session only. Must match <Typography.Text code>API_TOKEN</Typography.Text>.
			</Typography.Paragraph>
		</FormField>
	)
}

export function AccessSettingsSection(props: AccessSettingsSectionProps) {
	return (
		<Space orientation="vertical" size="middle" className={styles.fullWidth}>
			<div className={styles.accessCard}>
				<div className={styles.accessCardHeader}>
					<Typography.Text strong>Server access</Typography.Text>
				</div>
				<ApiTokenField
					key={props.apiToken}
					apiToken={props.apiToken}
					inputId="settings-api-token"
					setApiToken={props.setApiToken}
				/>

				<FormField label="Selected Profile" htmlFor="settings-selected-profile" extra="Change from the header or Profiles.">
					<Input id="settings-selected-profile" value={props.profileName ?? ''} placeholder="No profile selected" readOnly />
					{props.profileId ? <Typography.Text type="secondary">ID: {props.profileId}</Typography.Text> : null}
				</FormField>
			</div>

			<div className={styles.accessReferenceCard}>
				<Collapse
					size="small"
					items={[
						{
							key: 'advanced',
							label: 'API reference',
							children: (
								<Space orientation="vertical" size={4} className={styles.fullWidth}>
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
