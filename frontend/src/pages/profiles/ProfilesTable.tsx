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
	return (
		<div className={styles.tableWrap}>
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
						<tr key={row.profile.id}>
							<td className={styles.td}>
								<Space>
									<Typography.Text strong>{row.profile.name}</Typography.Text>
									{row.isActive ? <Typography.Text type="success">Active</Typography.Text> : null}
								</Space>
							</td>
							<td className={styles.td}>
								<Typography.Text code>{row.providerLabel}</Typography.Text>
							</td>
							<td className={styles.td}>
								<Space orientation="vertical" size={0} className={styles.connectionStack}>
									<Typography.Text>{row.connection.primary}</Typography.Text>
									{row.connection.secondary ? <Typography.Text type="secondary">{row.connection.secondary}</Typography.Text> : null}
								</Space>
							</td>
							<td className={styles.td}>
								<Typography.Text type="secondary">{row.flagsText}</Typography.Text>
							</td>
							<td className={styles.td}>
								<Space wrap>
									<Button size="small" onClick={() => props.onUseProfile(row.profile.id)}>
										Use
									</Button>
									<Dropdown
										trigger={['click']}
										menu={{
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
												{ type: 'divider' },
												{
													key: 'delete',
													label: props.isDeletePending && props.deletingProfileId === row.profile.id ? 'Deleting…' : 'Delete',
													danger: true,
													disabled: props.isDeletePending && props.deletingProfileId === row.profile.id,
												},
											],
											onClick: ({ key }) => {
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
										}}
									>
										<Button size="small" icon={<MoreOutlined />} aria-label={`More actions for ${row.profile.name}`}>
											More
										</Button>
									</Dropdown>
								</Space>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	)
}
