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

	return (
		<section className={styles.onboardingCard} aria-label="Getting started">
			<div className={styles.onboardingHeader}>
				<Typography.Title level={5} className={styles.onboardingTitle}>
					Getting started
				</Typography.Title>
				<Typography.Text type="secondary">Quick setup checklist.</Typography.Text>
			</div>
			<div className={styles.onboardingChecklist}>
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
				<Checkbox checked={props.profilesCount > 0} disabled>
					At least one profile created
				</Checkbox>
				<Checkbox checked={!!props.profileId} disabled>
					Active profile selected
				</Checkbox>
			</div>
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
