import { Alert, Button, Popconfirm, Spin, Tag, Typography } from 'antd'

import { formatBytes } from '../lib/transfer'
import styles from './SidebarBackupAction.module.css'

type StagedRestoreItem = {
	id: string
	stagedAt: string
	stagingDir: string
	manifest?: {
		bundleKind: string
		dbBackend: string
		confidentialityMode?: string | null
		payloadBytes?: number | null
	} | null
}

type SidebarStagedRestoresSectionProps = {
	stagedRestores: StagedRestoreItem[]
	stagedRestoresLoading: boolean
	stagedRestoresError: string | null
	cleanupRestoresLoading: boolean
	deleteRestoreId: string | null
	staleRestoreCount: number
	isRestoreStale: (stagedAt: string) => boolean
	formatRestoreAge: (stagedAt: string) => string
	onRefresh: () => void
	onDeleteStale: () => void
	onDeleteRestore: (restoreId: string) => void
	onCopy: (label: string, text: string) => Promise<void>
}

export function SidebarStagedRestoresSection(props: SidebarStagedRestoresSectionProps) {
	return (
		<div className={styles.section}>
			<div className={styles.inventoryHeader}>
				<div>
					<Typography.Text strong>Staged restores</Typography.Text>
					<Typography.Text type="secondary">Keep the active validation bundle and at most one rollback candidate.</Typography.Text>
				</div>
				<div className={styles.inlineActions}>
					<Button size="small" onClick={() => props.onRefresh()} disabled={props.stagedRestoresLoading}>
						Refresh
					</Button>
					<Popconfirm
						title="Delete stale staged restores?"
						description="This removes restores older than 7 days from the staged inventory."
						okText="Delete stale"
						okButtonProps={{ danger: true, loading: props.cleanupRestoresLoading }}
						onConfirm={() => props.onDeleteStale()}
						disabled={props.staleRestoreCount === 0}
					>
						<Button size="small" danger disabled={props.staleRestoreCount === 0}>
							Delete stale
						</Button>
					</Popconfirm>
				</div>
			</div>
			{props.stagedRestoresError ? <Alert type="error" showIcon title="Failed to load staged restores" description={props.stagedRestoresError} /> : null}
			{props.stagedRestoresLoading ? (
				<div className={styles.loadingRow}>
					<Spin size="small" /> <Typography.Text type="secondary">Loading staged restores…</Typography.Text>
				</div>
			) : null}
			{!props.stagedRestoresLoading && props.stagedRestores.length === 0 ? (
				<Typography.Text type="secondary">No staged restores yet.</Typography.Text>
			) : null}
			{props.stagedRestores.map((item) => {
				const stale = props.isRestoreStale(item.stagedAt)
				const manifest = item.manifest
				const payloadSizeLabel = manifest?.payloadBytes != null ? formatBytes(manifest.payloadBytes) : 'size unknown'
				return (
					<div key={item.id} className={styles.inventoryItem}>
						<div className={styles.inventoryHeader}>
							<div className={styles.inventoryTitle}>
								<Typography.Text strong>{item.id}</Typography.Text>
								<div className={styles.statusRow}>
									{manifest ? <Tag>{manifest.bundleKind}</Tag> : null}
									{manifest ? <Tag>{manifest.dbBackend}</Tag> : null}
									{manifest?.confidentialityMode ? <Tag color="processing">{manifest.confidentialityMode}</Tag> : null}
									{stale ? <Tag color="warning">stale</Tag> : null}
								</div>
							</div>
							<div className={styles.inlineActions}>
								<Button size="small" onClick={() => void props.onCopy('Staging path', item.stagingDir)}>
									Copy path
								</Button>
								<Popconfirm
									title="Delete staged restore?"
									description="This removes only the staged directory. It does not touch the running server."
									okText="Delete"
									okButtonProps={{ danger: true, loading: props.deleteRestoreId === item.id }}
									onConfirm={() => props.onDeleteRestore(item.id)}
								>
									<Button size="small" danger loading={props.deleteRestoreId === item.id}>
										Delete
									</Button>
								</Popconfirm>
							</div>
						</div>
						<Typography.Text type="secondary">
							{props.formatRestoreAge(item.stagedAt)} · {payloadSizeLabel} · {item.stagingDir}
						</Typography.Text>
					</div>
				)
			})}
		</div>
	)
}
