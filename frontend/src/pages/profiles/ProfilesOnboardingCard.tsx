import { Button, Checkbox, Typography } from 'antd'

import { LinkButton } from '../../components/LinkButton'
import styles from '../ProfilesPage.module.css'

type TransferEngineInfo = {
	available?: boolean
	compatible?: boolean
	minVersion?: string | null
} | null | undefined

type Props = {
	visible: boolean
	backendConnected: boolean
	transferEngine: TransferEngineInfo
	apiTokenEnabled: boolean
	apiToken: string
	profilesCount: number
	profileId: string | null
	onCreateProfile: () => void
	onDismiss: () => void
}

export function ProfilesOnboardingCard(props: Props) {
	if (!props.visible) return null
	const diagnosticsNeedAttention =
		!props.backendConnected ||
		!(props.transferEngine?.available ?? false) ||
		!(props.transferEngine?.compatible ?? false) ||
		(props.apiTokenEnabled && !props.apiToken.trim())

	return (
		<section className={styles.onboardingCard} aria-label="Getting started">
			<div className={styles.onboardingHeader}>
				<Typography.Title level={5} className={styles.onboardingTitle}>
					Getting started
				</Typography.Title>
				<Typography.Text type="secondary">Create a profile, select it, then open your objects.</Typography.Text>
			</div>
			<div className={styles.onboardingChecklist}>
				<Checkbox checked={props.profilesCount > 0} disabled>
					Create a storage profile
				</Checkbox>
				<Checkbox checked={!!props.profileId} disabled>
					Select the active profile
				</Checkbox>
			</div>
			<details className={styles.onboardingDiagnostics} open={diagnosticsNeedAttention}>
				<summary className={styles.onboardingDiagnosticsSummary}>System readiness</summary>
				<div className={styles.onboardingDiagnosticsList}>
					<Checkbox checked={props.backendConnected} disabled>
						Backend connected
					</Checkbox>
					<Checkbox checked={props.transferEngine?.available ?? false} disabled>
						Transfer engine detected (rclone)
					</Checkbox>
					<Checkbox checked={props.transferEngine?.compatible ?? false} disabled>
						Transfer engine compatible
						{props.transferEngine?.minVersion ? ` (>= ${props.transferEngine.minVersion})` : ''}
					</Checkbox>
					<Checkbox checked={props.apiTokenEnabled ? !!props.apiToken.trim() : true} disabled>
						API token configured{props.apiTokenEnabled ? '' : ' (not required)'}
					</Checkbox>
				</div>
			</details>
			<div className={styles.onboardingActions}>
				<Button size="small" type="primary" onClick={props.onCreateProfile}>
					Create profile
				</Button>
				<LinkButton to="/buckets" size="small" disabled={!props.profileId}>
					Buckets
				</LinkButton>
				<LinkButton to="/objects" size="small" disabled={!props.profileId}>
					Objects
				</LinkButton>
				<button type="button" className={styles.onboardingDismissButton} onClick={props.onDismiss}>
					Dismiss
				</button>
			</div>
		</section>
	)
}
