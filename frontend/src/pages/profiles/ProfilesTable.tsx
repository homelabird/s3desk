import { MoreOutlined } from '@ant-design/icons'
import { Button, Dropdown, Space, Typography } from 'antd'

import type { Profile } from '../../api/types'
import styles from '../ProfilesPage.module.css'
import type { ProfileTableRowViewModel } from './profileViewModel'

type ProfilesTableProps = {
	rows: ProfileTableRowViewModel[]
	onUseProfile: (id: string) => void
	onEdit: (profile: Profile) => void
	onTest: (id: string) => void
	onBenchmark: (id: string) => void
	onOpenYaml: (profile: Profile) => void
	onDelete: (profile: Profile) => void
	isTestPending: boolean
	testingProfileId: string | null
	isBenchmarkPending: boolean
	benchmarkingProfileId: string | null
	isExportYamlPending: boolean
	exportingProfileId: string | null
	isDeletePending: boolean
	deletingProfileId: string | null
}

export function ProfilesTable(props: ProfilesTableProps) {
	const buildRowMenu = (row: ProfileTableRowViewModel) => ({
		items: [
			{ key: 'edit', label: 'Edit' },
			{
				key: 'test',
				label: props.isTestPending && props.testingProfileId === row.profile.id ? 'Testing…' : 'Test',
				disabled: props.isTestPending && props.testingProfileId === row.profile.id,
			},
			{
				key: 'benchmark',
				label: props.isBenchmarkPending && props.benchmarkingProfileId === row.profile.id ? 'Benchmarking…' : 'Benchmark',
				disabled: props.isBenchmarkPending && props.benchmarkingProfileId === row.profile.id,
			},
			{
				key: 'yaml',
				label: props.isExportYamlPending && props.exportingProfileId === row.profile.id ? 'Exporting YAML…' : 'YAML',
				disabled: props.isExportYamlPending && props.exportingProfileId === row.profile.id,
			},
			{ type: 'divider' as const },
			{
				key: 'delete',
				label: props.isDeletePending && props.deletingProfileId === row.profile.id ? 'Deleting…' : 'Delete',
				danger: true,
				disabled: props.isDeletePending && props.deletingProfileId === row.profile.id,
			},
		],
		onClick: ({ key }: { key: string }) => {
			if (key === 'edit') {
				props.onEdit(row.profile)
				return
			}
			if (key === 'test') {
				props.onTest(row.profile.id)
				return
			}
			if (key === 'benchmark') {
				props.onBenchmark(row.profile.id)
				return
			}
			if (key === 'yaml') {
				props.onOpenYaml(row.profile)
				return
			}
			if (key === 'delete') {
				props.onDelete(row.profile)
			}
		},
	})

	return (
		<div className={styles.tableWrap}>
			<div className={styles.desktopTable}>
				<table className={styles.table}>
					<thead>
						<tr className={styles.headRow}>
							<th className={`${styles.th} ${styles.thName}`}>Name</th>
							<th className={`${styles.th} ${styles.thProvider}`}>Provider</th>
							<th className={styles.th}>Connection</th>
							<th className={`${styles.th} ${styles.thFlags}`}>Flags</th>
							<th className={`${styles.th} ${styles.thActions}`}>Actions</th>
						</tr>
					</thead>
					<tbody>
						{props.rows.map((row) => (
							<tr key={row.profile.id} className={styles.tableRow}>
								<td className={styles.td}>
									<div className={styles.nameCell}>
										<Typography.Text strong>{row.profile.name}</Typography.Text>
										{row.isActive ? <span className={styles.statusBadge}>Active</span> : null}
									</div>
								</td>
								<td className={styles.td}>
									<span className={styles.providerBadge}>{row.providerLabel}</span>
								</td>
								<td className={styles.td}>
									<Space orientation="vertical" size={0} className={styles.connectionStack}>
										<Typography.Text className={styles.connectionPrimary}>{row.connection.primary}</Typography.Text>
										{row.connection.secondary ? <Typography.Text type="secondary">{row.connection.secondary}</Typography.Text> : null}
									</Space>
								</td>
								<td className={styles.td}>
									<div className={styles.flagList}>
										{row.flags.map((flag) => (
											<span key={flag} className={styles.flagChip}>
												{flag}
											</span>
										))}
									</div>
								</td>
								<td className={styles.td}>
									<div className={styles.actionGroup}>
										<Button size="small" type={row.isActive ? 'primary' : 'default'} onClick={() => props.onUseProfile(row.profile.id)}>
											{row.isActive ? 'Selected' : 'Use'}
										</Button>
										<Dropdown trigger={['click']} menu={buildRowMenu(row)}>
											<Button size="small" icon={<MoreOutlined />} aria-label={`More actions for ${row.profile.name}`}>
												More
											</Button>
										</Dropdown>
									</div>
								</td>
							</tr>
						))}
					</tbody>
				</table>
			</div>

			<div className={styles.mobileList}>
				{props.rows.map((row) => (
					<article key={row.profile.id} className={styles.mobileCard}>
						<div className={styles.mobileCardTop}>
							<div className={styles.mobileCardCopy}>
								<div className={styles.mobileTitleRow}>
									<Typography.Text strong>{row.profile.name}</Typography.Text>
									{row.isActive ? <span className={styles.statusBadge}>Active</span> : null}
								</div>
								<Typography.Text type="secondary" className={styles.mobileId}>
									{row.profile.id}
								</Typography.Text>
							</div>
							<span className={styles.providerBadge}>{row.providerLabel}</span>
						</div>

						<div className={styles.mobileMetaGrid}>
							<div>
								<div className={styles.mobileMetaLabel}>Connection</div>
								<div className={styles.mobileMetaValue}>
									<div>{row.connection.primary}</div>
									{row.connection.secondary ? <div className={styles.mobileMetaSecondary}>{row.connection.secondary}</div> : null}
								</div>
							</div>
							<div>
								<div className={styles.mobileMetaLabel}>Flags</div>
								<div className={styles.flagList}>
									{row.flags.map((flag) => (
										<span key={flag} className={styles.flagChip}>
											{flag}
										</span>
									))}
								</div>
							</div>
						</div>

						<div className={styles.mobileActionRow}>
							<Button type={row.isActive ? 'primary' : 'default'} onClick={() => props.onUseProfile(row.profile.id)}>
								{row.isActive ? 'Selected' : 'Use profile'}
							</Button>
							<Dropdown trigger={['click']} menu={buildRowMenu(row)}>
								<Button icon={<MoreOutlined />} aria-label={`More actions for ${row.profile.name}`}>
									More
								</Button>
							</Dropdown>
						</div>
					</article>
				))}
			</div>
		</div>
	)
}
