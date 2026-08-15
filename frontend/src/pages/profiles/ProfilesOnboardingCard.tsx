import { CheckCircleOutlined, ExclamationCircleOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'

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
	const hasProfile = props.profilesCount > 0
	const hasActiveProfile = !!props.profileId
	const transferEngineAvailable = props.transferEngine?.available ?? false
	const transferEngineCompatible = props.transferEngine?.compatible ?? false
	const apiTokenReady = props.apiTokenEnabled ? !!props.apiToken.trim() : true
	const diagnosticsNeedAttention =
		!props.backendConnected ||
		!transferEngineAvailable ||
		!transferEngineCompatible ||
		!apiTokenReady
	const onboardingSteps = [
		{ label: 'Create a storage profile', complete: hasProfile, pending: 'Next' },
		{ label: 'Choose the active profile', complete: hasActiveProfile, pending: 'Needed' },
	]
	const connectionChecks = [
		{ label: 'S3Desk server is reachable', complete: props.backendConnected },
		{ label: 'File transfer helper is available', complete: transferEngineAvailable },
		{
			label: props.transferEngine?.minVersion
				? `File transfer helper supports transfers (${props.transferEngine.minVersion}+ required)`
				: 'File transfer helper supports transfers',
			complete: transferEngineCompatible,
		},
		{
			label: props.apiTokenEnabled ? 'API token is entered' : 'API token is not required',
			complete: apiTokenReady,
		},
	]
	const nextStepCopy = hasProfile
		? 'Choose a profile to open buckets and objects.'
		: 'Create a profile to open buckets and objects.'

	return (
		<section className={styles.onboardingCard} aria-label="Getting started">
			<div className={styles.onboardingHeader}>
				<Typography.Title level={2} className={styles.onboardingTitle}>
					Getting started
				</Typography.Title>
				<Typography.Text type="secondary">Create a profile, select it, then open your objects.</Typography.Text>
			</div>
			<ol className={styles.onboardingChecklist} aria-label="Profile onboarding progress">
				{onboardingSteps.map((step) => (
					<li key={step.label} className={styles.onboardingStep} data-complete={step.complete ? 'true' : 'false'}>
						<span className={styles.onboardingStepIcon} aria-hidden="true">
							{step.complete ? <CheckCircleOutlined /> : <InfoCircleOutlined />}
						</span>
						<span className={styles.onboardingStepLabel}>{step.label}</span>
						<span className={styles.onboardingStepStatus}>{step.complete ? 'Done' : step.pending}</span>
					</li>
				))}
			</ol>
			<details className={styles.onboardingDiagnostics} open={diagnosticsNeedAttention}>
				<summary className={styles.onboardingDiagnosticsSummary}>
					{diagnosticsNeedAttention ? 'Connection checks need attention' : 'Connection checks'}
				</summary>
				<ul className={styles.onboardingDiagnosticsList}>
					{connectionChecks.map((check) => (
						<li key={check.label} className={styles.onboardingDiagnosticsItem} data-complete={check.complete ? 'true' : 'false'}>
							<span className={styles.onboardingDiagnosticsIcon} aria-hidden="true">
								{check.complete ? <CheckCircleOutlined /> : <ExclamationCircleOutlined />}
							</span>
							<span>{check.label}</span>
							<span className={styles.onboardingDiagnosticsStatus}>
								{check.complete ? 'Ready' : 'Needs attention'}
							</span>
						</li>
					))}
				</ul>
			</details>
			<div className={styles.onboardingActions}>
				{hasActiveProfile ? (
					<>
						<LinkButton to="/objects" size="small" type="primary">
							Open objects
						</LinkButton>
						<LinkButton to="/buckets" size="small">
							Open buckets
						</LinkButton>
						<Button size="small" onClick={props.onCreateProfile}>
							Create another profile
						</Button>
					</>
				) : (
					<>
						<Button size="small" type="primary" onClick={props.onCreateProfile}>
							{hasProfile ? 'Create another profile' : 'Create profile'}
						</Button>
						<Typography.Text type="secondary" className={styles.onboardingNextStep}>
							{nextStepCopy}
						</Typography.Text>
					</>
				)}
				<button type="button" className={styles.onboardingDismissButton} onClick={props.onDismiss}>
					Hide guide
				</button>
			</div>
		</section>
	)
}
