import type { PointerEvent, ReactNode } from 'react'
import { Drawer } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'

import styles from './objects.module.css'
import { ObjectsDetailsCollapsed, ObjectsDetailsPane } from './ObjectsDetailsPane'

type ObjectsDetailsPanelProps = {
	dockDetails: boolean
	detailsOpen: boolean
	detailsDrawerOpen: boolean
	detailsPanelBody: ReactNode
	onOpenDetails: () => void
	onCloseDetails: () => void
	onCloseDrawer: () => void
	onResizePointerDown: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerMove: (event: PointerEvent<HTMLDivElement>) => void
	onResizePointerUp: (event: PointerEvent<HTMLDivElement>) => void
}

export function ObjectsDetailsPanel(props: ObjectsDetailsPanelProps) {
	return (
		<>
			{props.dockDetails ? (
				props.detailsOpen ? (
					<>
						<div
							onPointerDown={props.onResizePointerDown}
							onPointerMove={props.onResizePointerMove}
							onPointerUp={props.onResizePointerUp}
							onPointerCancel={props.onResizePointerUp}
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

			<Drawer
				open={!props.dockDetails && props.detailsDrawerOpen}
				onClose={props.onCloseDrawer}
				title="Details"
				placement="right"
				width="90%"
			>
				<div style={{ paddingBottom: 12 }}>{props.detailsPanelBody}</div>
			</Drawer>
		</>
	)
}
