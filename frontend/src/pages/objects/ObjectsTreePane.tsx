import { useId, type ReactNode } from 'react'
import { Typography } from 'antd'

import styles from './objects.module.css'

type ObjectsTreePaneProps = {
	title?: ReactNode
	extra?: ReactNode
	children: ReactNode
	collapsible?: boolean
	expanded?: boolean
	onExpandedChange?: (expanded: boolean) => void
	testId?: string
}

export function ObjectsTreePane(props: ObjectsTreePaneProps) {
	const bodyId = useId()
	const isExpanded = props.collapsible ? props.expanded !== false : true

	return (
		<div
			className={`${styles.panelCard} ${styles.pane} ${props.collapsible ? styles.panelCardCollapsible : ''}`.trim()}
			data-testid={props.testId}
			data-expanded={isExpanded ? 'true' : 'false'}
		>
			<div className={styles.panelHeader}>
				{props.collapsible ? (
					<button
						type="button"
						className={styles.panelToggleButton}
						aria-expanded={isExpanded}
						aria-controls={bodyId}
						onClick={() => props.onExpandedChange?.(!isExpanded)}
					>
						<Typography.Text type="secondary">{props.title ?? 'Folders'}</Typography.Text>
						<span className={styles.panelToggleChevron} aria-hidden="true">
							{isExpanded ? '▾' : '▸'}
						</span>
					</button>
				) : (
					<Typography.Text type="secondary">{props.title ?? 'Folders'}</Typography.Text>
				)}
				{props.extra ?? null}
			</div>
			{isExpanded ? (
				<div id={bodyId} className={styles.panelBody}>
					{props.children}
				</div>
			) : null}
		</div>
	)
}
