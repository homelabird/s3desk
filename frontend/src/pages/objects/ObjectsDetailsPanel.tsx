import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'

import styles from './ObjectsShell.module.css'
import { ObjectsDetailsCollapsed, ObjectsDetailsPane } from './ObjectsDetailsPane'
import { ObjectsOverlaySheet } from './ObjectsOverlaySheet'
import { OBJECTS_DETAILS_DRAWER_ID } from './objectsOverlayIds'

type ObjectsDetailsPanelProps = {
	dockDetails: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	detailsDrawerSuspended?: boolean
	detailsPanelBody: ReactNode
	onOpenDetails: () => void
	onCloseDetails: () => void
	onCloseDrawer: () => void
	onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void
	onResizeKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void
	resizeMinWidth: number
	resizeMaxWidth: number
	resizeValue: number
}

export function ObjectsDetailsPanel(props: ObjectsDetailsPanelProps) {
	const showDetailsDrawer = !props.dockDetails && props.detailsDrawerOpen && !props.detailsDrawerSuspended

	return (
		<>
			{props.dockDetails ? (
				props.detailsOpen ? (
					<>
						<div
							role="separator"
							tabIndex={0}
							aria-label="Resize details pane"
							aria-orientation="vertical"
							aria-valuemin={props.resizeMinWidth}
							aria-valuemax={props.resizeMaxWidth}
							aria-valuenow={props.resizeValue}
							onPointerDown={props.onResizePointerDown}
							onPointerMove={props.onResizePointerMove}
							onPointerUp={props.onResizePointerUp}
							onPointerCancel={props.onResizePointerUp}
							onKeyDown={props.onResizeKeyDown}
							className={`${styles.resizeHandle} ${styles.layoutDetailsHandle}`}
						>
							<div className={styles.resizeBar} />
						</div>

						<div className={`${styles.layoutPane} ${styles.layoutDetailsPane}`}>
							<ObjectsDetailsPane title="Details" body={props.detailsPanelBody} onHide={props.onCloseDetails} />
						</div>
					</>
				) : (
					<>
						<div className={styles.layoutDetailsHandle} aria-hidden="true" />
						<div className={`${styles.layoutPane} ${styles.layoutDetailsPane}`}>
							<ObjectsDetailsCollapsed onOpen={props.onOpenDetails} icon={<InfoCircleOutlined />} ariaLabel="Show details" />
						</div>
					</>
				)
			) : null}

			<ObjectsOverlaySheet
				open={showDetailsDrawer}
				onClose={props.onCloseDrawer}
				title="Details"
				placement="right"
				sheetId={OBJECTS_DETAILS_DRAWER_ID}
				backdropInteractive={!props.detailsDrawerSuspended}
				width="min(100vw, 520px)"
				dataTestId="objects-details-sheet"
			>
				<div className={styles.objectsSheetBody}>{props.detailsPanelBody}</div>
			</ObjectsOverlaySheet>
		</>
	)
}
