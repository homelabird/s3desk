import { Suspense } from 'react'

import { ShellText } from './ObjectsPaneShellText'
import shellStyles from './ObjectsShell.module.css'
import styles from './objects.module.css'
import { ObjectsDetailsPanelSection } from './objectsPageLazy'
import type { ObjectsPagePanesProps } from './ObjectsPagePaneTypes'

type ObjectsDetailsPanelSectionProps = ObjectsPagePanesProps['detailsProps']

export function ObjectsDetailsPaneHost({ detailsProps }: { detailsProps: ObjectsDetailsPanelSectionProps }) {
	const shouldLoadDetailsPane =
		(detailsProps.dockDetails && detailsProps.detailsOpen) ||
		(detailsProps.detailsDrawerOpen && !detailsProps.detailsDrawerSuspended)
	const shouldShowCollapsedDetails = detailsProps.dockDetails && !detailsProps.detailsOpen

	if (shouldLoadDetailsPane) {
		return (
			<Suspense
				fallback={
					<div className={shellStyles.paneSkeleton}>
						<ShellText>Loading…</ShellText>
					</div>
				}
			>
				<ObjectsDetailsPanelSection {...detailsProps} />
			</Suspense>
		)
	}

	if (!shouldShowCollapsedDetails) return null

	return (
		<>
			<div className={shellStyles.layoutDetailsHandle} aria-hidden="true" />
			<div className={`${shellStyles.layoutPane} ${shellStyles.layoutDetailsPane}`}>
				<div className={`${styles.panelCard} ${shellStyles.detailsCollapsed} ${styles.pane}`}>
					<button
						type="button"
						className={shellStyles.detailsCollapsedButton}
						onClick={detailsProps.onOpenDetails}
						aria-label="Show details"
					>
						i
					</button>
				</div>
			</div>
		</>
	)
}
