import { CloudDownloadOutlined } from '@ant-design/icons'
import { Spin, Typography } from 'antd'
import { lazy, Suspense, useState } from 'react'

import type { APIClientShape } from '../api/client'
import type { MetaResponse } from '../api/types'
import { buildBackupCapabilitySummary } from './backupCapabilitySummary'
import { OverlaySheet } from './OverlaySheet'
import styles from './SidebarBackupAction.module.css'

type SidebarBackupActionProps = {
	api: APIClientShape
	meta?: MetaResponse
	onActionComplete?: () => void
	scopeKey?: string
	variant?: 'sidebar' | 'surface'
}

const SidebarBackupDrawer = lazy(() =>
	import('./SidebarBackupDrawer').then((mod) => ({ default: mod.SidebarBackupDrawer })),
)
const SIDEBAR_BACKUP_DRAWER_ID = 'sidebar-backup-drawer-panel'

export function SidebarBackupAction(props: SidebarBackupActionProps) {
	const sessionKey = props.scopeKey ?? '__default__'
	return <SidebarBackupActionSession key={sessionKey} {...props} />
}

function SidebarBackupActionSession(props: SidebarBackupActionProps) {
	const [open, setOpen] = useState(false)
	const triggerSubtitle = buildBackupCapabilitySummary(props.meta).triggerSubtitle

	return (
		<>
			<button
				type="button"
				className={[styles.trigger, props.variant === 'surface' ? styles.triggerSurface : '']
					.filter(Boolean)
					.join(' ')}
				onClick={() => setOpen(true)}
				aria-label="Backup"
				aria-expanded={open}
				aria-haspopup="dialog"
				aria-controls={SIDEBAR_BACKUP_DRAWER_ID}
			>
				<span className={styles.triggerIcon} aria-hidden="true">
					<CloudDownloadOutlined />
				</span>
				<span className={styles.triggerCopy}>
					<span className={styles.triggerTitle}>Backup</span>
					<span className={styles.triggerSubtitle}>{triggerSubtitle}</span>
				</span>
			</button>
			{open ? (
				<Suspense fallback={<SidebarBackupDrawerFallback onClose={() => setOpen(false)} />}>
					<SidebarBackupDrawer
						api={props.api}
						meta={props.meta}
						open={open}
						sheetId={SIDEBAR_BACKUP_DRAWER_ID}
						onActionComplete={props.onActionComplete}
						onClose={() => setOpen(false)}
					/>
				</Suspense>
			) : null}
		</>
	)
}

function SidebarBackupDrawerFallback(props: { onClose: () => void }) {
	return (
		<OverlaySheet
			open
			onClose={props.onClose}
			title="Backup and restore"
			placement="right"
			width="min(92vw, 560px)"
			sheetId={SIDEBAR_BACKUP_DRAWER_ID}
		>
			<div className={styles.panel}>
				<div className={styles.loadingRow} role="status" aria-live="polite">
					<Spin size="small" />
					<Typography.Text type="secondary">Loading backup tools...</Typography.Text>
				</div>
			</div>
		</OverlaySheet>
	)
}
