import { forwardRef } from 'react'
import type { CSSProperties, ReactNode } from 'react'

import styles from './objects.module.css'

export type ObjectsLayoutProps = {
	treeWidthPx: number
	treeHandleWidthPx: number
	detailsWidthPx: number
	detailsHandleWidthPx: number
	treeDocked: boolean
	detailsDocked: boolean
	detailsOpen: boolean
	children: ReactNode
}

export const ObjectsLayout = forwardRef<HTMLDivElement, ObjectsLayoutProps>(function ObjectsLayout(
	{ treeWidthPx, treeHandleWidthPx, detailsWidthPx, detailsHandleWidthPx, treeDocked, detailsDocked, detailsOpen, children },
	ref,
) {
	return (
		<div
			ref={ref}
			className={styles.layout}
			data-tree-docked={treeDocked}
			data-details-docked={detailsDocked}
			data-details-open={detailsOpen}
			style={
				{
					'--objects-tree-width': `${treeWidthPx}px`,
					'--objects-tree-handle-width': `${treeHandleWidthPx}px`,
					'--objects-details-width': `${detailsWidthPx}px`,
					'--objects-details-handle-width': `${detailsHandleWidthPx}px`,
				} as CSSProperties
			}
		>
			{children}
		</div>
	)
})
