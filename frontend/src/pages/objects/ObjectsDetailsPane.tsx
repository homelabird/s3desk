import type { ReactNode } from 'react'
import { Button, Space, Typography } from 'antd'

import styles from './objects.module.css'

export function ObjectsDetailsPane(props: { title?: string; body: ReactNode; onHide?: () => void }) {
	return (
		<div className={`${styles.panelCard} ${styles.pane}`}>
			<div className={styles.panelHeader}>
				<Typography.Text type="secondary">{props.title ?? 'Details'}</Typography.Text>
				{props.onHide ? (
					<Space size="small">
						<Button size="small" onClick={props.onHide}>
							Hide
						</Button>
					</Space>
				) : null}
			</div>
			<div className={`${styles.panelBody} ${styles.detailsBody}`}>{props.body}</div>
		</div>
	)
}

export function ObjectsDetailsCollapsed(props: { onOpen: () => void; icon: ReactNode; ariaLabel?: string }) {
	return (
		<div className={`${styles.panelCard} ${styles.detailsCollapsed} ${styles.pane}`}>
			<Button size="small" type="text" onClick={props.onOpen} icon={props.icon} aria-label={props.ariaLabel} />
		</div>
	)
}
