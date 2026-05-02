import { useId, type ReactNode } from 'react'
import { Typography } from 'antd'

import shellStyles from './ObjectsShell.module.css'
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
	const headerTestId = props.testId ? `${props.testId}-header` : undefined
	const bodyTestId = props.testId ? `${props.testId}-body` : undefined

	return (
		<div
			className={`${styles.panelCard} ${styles.pane} ${props.collapsible ? styles.panelCardCollapsible : ''}`.trim()}
			data-testid={props.testId}
			data-expanded={isExpanded ? 'true' : 'false'}
		>
			<div className={shellStyles.panelHeader} data-testid={headerTestId}>
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
				<div id={bodyId} className={shellStyles.panelBody} data-testid={bodyTestId}>
					{props.children}
				</div>
			) : null}
		</div>
	)
}
