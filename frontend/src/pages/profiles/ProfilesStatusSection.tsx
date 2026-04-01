import { Alert, Button, Empty, Space, Spin, Typography } from 'antd'

import { formatErrorWithHint as formatErr } from '../../lib/errors'
import type { Profile } from '../../api/types'
import { ProfilesTable } from './ProfilesTable'
import type { ProfileTableRowViewModel } from './profileViewModel'
import styles from '../ProfilesPage.module.css'

type Props = {
	currentScopeKey: string
	profiles: Profile[]
	profilesError: unknown
	profilesNeedingAttention: Profile[]
	profilesQueryIsFetching: boolean
	showProfilesEmpty: boolean
	tableRows: ProfileTableRowViewModel[]
	onUseProfile: (v: string | null) => void
	onEditProfile: (profile: Profile | null) => void
	onTestProfile: (id: string) => void
	onBenchmarkProfile: (id: string) => void
	onOpenYaml: (profile: Profile) => void
	onDeleteProfile: (profile: Profile) => void
	isTestPending: boolean
	testingProfileId: string | null
	isBenchmarkPending: boolean
	benchmarkingProfileId: string | null
	isExportYamlPending: boolean
	exportingProfileId: string | null
	isDeletePending: boolean
	deletingProfileId: string | null
	onCreateProfile: () => void
}

export function ProfilesStatusSection(props: Props) {
	return (
		<>
			{props.profilesError ? (
				<Alert type="error" showIcon title="Failed to load profiles" description={formatErr(props.profilesError)} />
			) : null}

			{props.profilesNeedingAttention.length > 0 ? (
				<Alert
					type="warning"
					showIcon
					title={`Profiles need updates (${props.profilesNeedingAttention.length})`}
					description={
						<Space orientation="vertical" size={8} className={styles.fullWidth}>
							<Typography.Text type="secondary">
								Some saved profiles no longer meet the current provider requirements. Edit each affected profile and save it again.
							</Typography.Text>
							<Button
								size="small"
								onClick={() => {
									const nextProfile = props.profilesNeedingAttention[0]
									if (nextProfile) props.onEditProfile(nextProfile)
								}}
							>
								Open next profile to fix
							</Button>
							<Space orientation="vertical" size={4} className={styles.fullWidth}>
								{props.profilesNeedingAttention.map((profile) => (
									<Space key={profile.id} align="start" className={styles.fullWidth}>
										<Typography.Text className={styles.fullWidth}>
											<strong>{profile.name}</strong>: {profile.validation?.issues?.[0]?.message ?? 'Update required'}
										</Typography.Text>
										<Button size="small" type="link" onClick={() => props.onEditProfile(profile)} aria-label={`Edit profile ${profile.name}`}>
											Edit profile
										</Button>
									</Space>
								))}
							</Space>
						</Space>
					}
				/>
			) : null}

			{props.profilesQueryIsFetching && props.profiles.length === 0 ? (
				<div className={styles.loadingRow}>
					<Spin />
				</div>
			) : props.showProfilesEmpty ? (
				<Empty description="No profiles yet">
					<Button type="primary" onClick={props.onCreateProfile}>
						Create profile
					</Button>
				</Empty>
			) : (
				<ProfilesTable
					scopeKey={props.currentScopeKey}
					rows={props.tableRows}
					onUseProfile={(id) => props.onUseProfile(id)}
					onEdit={(profile) => props.onEditProfile(profile)}
					onTest={props.onTestProfile}
					onBenchmark={props.onBenchmarkProfile}
					onOpenYaml={(profile) => props.onOpenYaml(profile)}
					onDelete={props.onDeleteProfile}
					isTestPending={props.isTestPending}
					testingProfileId={props.testingProfileId}
					isBenchmarkPending={props.isBenchmarkPending}
					benchmarkingProfileId={props.benchmarkingProfileId}
					isExportYamlPending={props.isExportYamlPending}
					exportingProfileId={props.exportingProfileId}
					isDeletePending={props.isDeletePending}
					deletingProfileId={props.deletingProfileId}
				/>
			)}
		</>
	)
}
