import { Typography } from 'antd'
import type { ReactNode } from 'react'

import styles from './PageSection.module.css'

type PageSectionProps = {
	title?: ReactNode
	description?: ReactNode
	actions?: ReactNode
	children: ReactNode
	className?: string
	bodyClassName?: string
	flush?: boolean
}

export function PageSection({ title, description, actions, children, className, bodyClassName, flush = false }: PageSectionProps) {
	const sectionClassName = className ? `${styles.section} ${className}` : styles.section
	const bodyClassNames = [styles.body, flush ? styles.bodyFlush : '', bodyClassName ?? ''].filter(Boolean).join(' ')
	const hasHeader = title || description || actions

	return (
		<section className={sectionClassName}>
			{hasHeader ? (
				<div className={styles.header}>
					<div className={styles.copy}>
						{title ? (
							<Typography.Title level={4} className={styles.title}>
								{title}
							</Typography.Title>
						) : null}
						{description ? (
							<Typography.Paragraph className={styles.description}>
								{description}
							</Typography.Paragraph>
						) : null}
					</div>
					{actions ? <div className={styles.actions}>{actions}</div> : null}
				</div>
			) : null}
			<div className={bodyClassNames}>{children}</div>
		</section>
	)
}
