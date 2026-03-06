import { Typography } from 'antd'
import type { ReactNode } from 'react'

import styles from './PageHeader.module.css'

type PageHeaderProps = {
	eyebrow?: ReactNode
	title: ReactNode
	subtitle?: ReactNode
	actions?: ReactNode
	titleLevel?: 1 | 2 | 3 | 4 | 5
}

export function PageHeader({ eyebrow, title, subtitle, actions, titleLevel = 2 }: PageHeaderProps) {
	return (
		<section className={styles.header}>
			<div className={styles.copy}>
				{eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
				<Typography.Title level={titleLevel} className={styles.title}>
					{title}
				</Typography.Title>
				{subtitle ? (
					<Typography.Paragraph className={styles.subtitle}>
						{subtitle}
					</Typography.Paragraph>
				) : null}
			</div>
			{actions ? <div className={styles.actions}>{actions}</div> : null}
		</section>
	)
}
