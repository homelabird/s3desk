import type { ReactNode } from 'react'
import { Typography } from 'antd'

import styles from './objects.module.css'

export function ObjectsTreePane(props: { title?: string; children: ReactNode }) {
	return (
		<div className={`${styles.panelCard} ${styles.pane}`}>
			<div className={styles.panelHeader}>
				<Typography.Text type="secondary">{props.title ?? 'Folders'}</Typography.Text>
			</div>
			<div className={styles.panelBody}>{props.children}</div>
		</div>
	)
}

