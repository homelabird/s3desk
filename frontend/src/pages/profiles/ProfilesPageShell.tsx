import { Button, Space } from 'antd'
import type { ComponentProps } from 'react'

import { PageHeader } from '../../components/PageHeader'
import styles from '../ProfilesPage.module.css'
import { ProfilesDialogs } from './ProfilesDialogs'
import { ProfilesOnboardingCard } from './ProfilesOnboardingCard'
import { ProfilesStatusSection } from './ProfilesStatusSection'

type ProfilesOnboardingCardProps = ComponentProps<typeof ProfilesOnboardingCard>
type ProfilesStatusSectionProps = ComponentProps<typeof ProfilesStatusSection>
type ProfilesDialogsProps = ComponentProps<typeof ProfilesDialogs>

export type ProfilesPageShellProps = {
	onOpenImportModal: () => void
	onOpenCreateModal: () => void
	onboarding: ProfilesOnboardingCardProps
	status: ProfilesStatusSectionProps
	hasOpenModal: boolean
	dialogs: ProfilesDialogsProps
}

export function ProfilesPageShell(props: ProfilesPageShellProps) {
	return (
		<Space orientation="vertical" size="large" className={styles.fullWidth}>
			<PageHeader
				eyebrow="Workspace"
				title="Profiles"
				subtitle="Create connection profiles, verify endpoints, and choose the active workspace used across buckets, objects, uploads, and jobs."
				actions={
					<Space wrap>
						<Button onClick={props.onOpenImportModal}>Import YAML</Button>
						<Button type="primary" onClick={props.onOpenCreateModal}>
							New Profile
						</Button>
					</Space>
				}
			/>

			<ProfilesOnboardingCard {...props.onboarding} />

			<ProfilesStatusSection {...props.status} />

			{props.hasOpenModal ? <ProfilesDialogs {...props.dialogs} /> : null}
		</Space>
	)
}
