import { MoreOutlined } from '@ant-design/icons'
import { Button, Grid, Space, Typography, type MenuProps } from 'antd'

import type { Profile } from '../../api/types'
import { MenuPopover } from '../../components/MenuPopover'
import { useAppContentVirtualizer } from '../../components/useAppContentVirtualizer'
import styles from '../ProfilesPage.module.css'
import type { ProfileTableRowViewModel } from './profileViewModel'

type ProfilesTableProps = {
	scopeKey: string
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
	const screens = Grid.useBreakpoint()
	const useCompactList = !screens.lg
	const { hostRef, items: virtualItems, measureElement, paddingBottom, paddingTop } =
		useAppContentVirtualizer(props.rows.length, useCompactList ? 270 : 82)

	const buildRowMenu = (row: ProfileTableRowViewModel): MenuProps => ({
		items: [
			{ key: 'edit', label: 'Edit' },
			{
				key: 'test',
				label: props.isTestPending && props.testingProfileId === row.profile.id ? 'Testing…' : 'Test',
				disabled: props.isTestPending && props.testingProfileId === row.profile.id,
			},
			{
				key: 'advanced',
				label: 'Diagnostics & export',
				children: [
					{
						key: 'benchmark',
						label: props.isBenchmarkPending && props.benchmarkingProfileId === row.profile.id ? 'Benchmarking…' : 'Benchmark',
						disabled: props.isBenchmarkPending && props.benchmarkingProfileId === row.profile.id,
					},
					{
						key: 'yaml',
						label: props.isExportYamlPending && props.exportingProfileId === row.profile.id ? 'Exporting YAML…' : 'Export/Edit YAML',
						disabled: props.isExportYamlPending && props.exportingProfileId === row.profile.id,
					},
				],
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
			{useCompactList ? (
				<div ref={hostRef} className={styles.mobileList} data-testid="profiles-list-compact" role="list" aria-label="Profiles">
					<div style={{ height: paddingTop }} aria-hidden />
					{virtualItems.map((item) => {
						const row = props.rows[item.index]
						if (!row) return null
						return <article
							key={row.profile.id}
							ref={measureElement}
							data-index={item.index}
							className={styles.mobileCard}
							role="listitem"
							aria-posinset={item.index + 1}
							aria-setsize={props.rows.length}
						>
							<div className={styles.mobileCardTop}>
								<div className={styles.mobileCardCopy}>
									<div className={styles.mobileTitleRow}>
										<Typography.Text strong>{row.profile.name}</Typography.Text>
										{row.isActive ? <span className={styles.statusBadge}>Active</span> : null}
										{row.needsAttention ? (
											<span className={styles.warningBadge} title={row.attentionSummary}>
												Needs update
											</span>
										) : null}
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
											<span
												key={`${row.profile.id}-mobile-${flag.label}`}
												className={flag.tone === 'warning' ? `${styles.flagChip} ${styles.flagChipWarning}` : styles.flagChip}
												title={flag.title}
											>
												{flag.label}
											</span>
										))}
									</div>
								</div>
							</div>

							<div className={styles.mobileActionRow}>
								<Button type={row.isActive ? 'primary' : 'default'} onClick={() => props.onUseProfile(row.profile.id)}>
									{row.isActive ? 'Selected' : 'Use profile'}
								</Button>
								<MenuPopover menu={buildRowMenu(row)} align="end" scopeKey={props.scopeKey}>
									{({ toggle, open }) => (
										<Button
											icon={<MoreOutlined />}
											aria-label={`Profile tools for ${row.profile.name}`}
											aria-haspopup="menu"
											aria-expanded={open}
											onClick={toggle}
										>
											Tools
										</Button>
									)}
								</MenuPopover>
							</div>
						</article>
					})}
					<div style={{ height: paddingBottom }} aria-hidden />
				</div>
			) : (
				<div ref={hostRef} className={styles.desktopTable} data-testid="profiles-table-desktop">
					<table className={styles.table} aria-rowcount={props.rows.length + 1}>
						<caption className="sr-only">Profiles</caption>
						<thead>
							<tr className={styles.headRow}>
								<th scope="col" className={`${styles.th} ${styles.thName}`}>Name</th>
								<th scope="col" className={`${styles.th} ${styles.thProvider}`}>Provider</th>
								<th scope="col" className={styles.th}>Connection</th>
								<th scope="col" className={`${styles.th} ${styles.thFlags}`}>Flags</th>
								<th scope="col" className={`${styles.th} ${styles.thActions}`}>Actions</th>
							</tr>
						</thead>
						<tbody>
							{paddingTop > 0 ? <tr aria-hidden><td colSpan={5} style={{ height: paddingTop }} /></tr> : null}
							{virtualItems.map((item) => {
								const row = props.rows[item.index]
								if (!row) return null
								return <tr
									key={row.profile.id}
									ref={measureElement}
									data-index={item.index}
									aria-rowindex={item.index + 2}
									className={styles.tableRow}
								>
									<td className={styles.td}>
										<div className={styles.nameCell}>
											<Typography.Text strong>{row.profile.name}</Typography.Text>
											{row.isActive ? <span className={styles.statusBadge}>Active</span> : null}
											{row.needsAttention ? (
												<span className={styles.warningBadge} title={row.attentionSummary}>
													Needs update
												</span>
											) : null}
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
												<span
													key={`${row.profile.id}-${flag.label}`}
													className={flag.tone === 'warning' ? `${styles.flagChip} ${styles.flagChipWarning}` : styles.flagChip}
													title={flag.title}
												>
													{flag.label}
												</span>
											))}
										</div>
									</td>
									<td className={styles.td}>
										<div className={styles.actionGroup}>
											<Button size="small" type={row.isActive ? 'primary' : 'default'} onClick={() => props.onUseProfile(row.profile.id)}>
												{row.isActive ? 'Selected' : 'Use'}
											</Button>
											<MenuPopover menu={buildRowMenu(row)} align="end" scopeKey={props.scopeKey}>
												{({ toggle, open }) => (
													<Button
														size="small"
														icon={<MoreOutlined />}
														aria-label={`Profile tools for ${row.profile.name}`}
														aria-haspopup="menu"
														aria-expanded={open}
														onClick={toggle}
													>
														Tools
													</Button>
												)}
											</MenuPopover>
										</div>
									</td>
								</tr>
							})}
							{paddingBottom > 0 ? <tr aria-hidden><td colSpan={5} style={{ height: paddingBottom }} /></tr> : null}
						</tbody>
					</table>
				</div>
			)}
		</div>
	)
}
