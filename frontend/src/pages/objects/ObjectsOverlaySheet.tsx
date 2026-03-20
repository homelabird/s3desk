import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useId, useRef, type CSSProperties, type ReactNode } from 'react'

import { useOverlayLayer } from '../../components/useOverlayLayer'
import styles from './ObjectsShell.module.css'

type ObjectsOverlaySheetProps = {
	open: boolean
	onClose: () => void
	title: string
	placement: 'left' | 'right' | 'bottom'
	sheetId?: string
	backdropInteractive?: boolean
	width?: number | string
	height?: number | string
	dataTestId?: string
	extra?: ReactNode
	children: ReactNode
	bodyClassName?: string
	panelClassName?: string
}

export function ObjectsOverlaySheet(props: ObjectsOverlaySheetProps) {
	const {
		open,
		onClose,
		title,
		placement,
		sheetId,
		backdropInteractive = true,
		width,
		height,
		dataTestId,
		extra,
		children,
		bodyClassName,
		panelClassName,
	} = props
	const titleId = useId()
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)

	useOverlayLayer({
		open,
		onEscape: onClose,
		containerRef: panelRef,
		initialFocusRef: closeButtonRef,
		lockBodyScroll: true,
		trapFocus: true,
	})

	if (!open || typeof document === 'undefined') return null

	const panelStyle: CSSProperties =
		placement === 'right' || placement === 'left'
			? { width: width ?? '100%' }
			: { height: height ?? 'auto' }

	const resolvedPanelClassName = [
		styles.objectsOverlayPanel,
		placement === 'right'
			? styles.objectsOverlayPanelRight
			: placement === 'left'
				? styles.objectsOverlayPanelLeft
				: styles.objectsOverlayPanelBottom,
		panelClassName ?? '',
	]
		.filter(Boolean)
		.join(' ')

	const resolvedBodyClassName = [styles.objectsOverlayBody, bodyClassName ?? ''].filter(Boolean).join(' ')

	return createPortal(
		<div
			data-objects-overlay-sheet={sheetId}
			className={[
				styles.objectsOverlayBackdrop,
				backdropInteractive ? '' : styles.objectsOverlayBackdropPassthrough,
				placement === 'right'
					? styles.objectsOverlayBackdropRight
					: placement === 'left'
						? styles.objectsOverlayBackdropLeft
						: styles.objectsOverlayBackdropBottom,
			].join(' ')}
			onMouseDown={backdropInteractive ? onClose : undefined}
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				data-testid={dataTestId}
				className={resolvedPanelClassName}
				style={panelStyle}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className={styles.objectsOverlayHeader}>
					<div className={styles.objectsOverlayHeaderMain}>
						<h2 id={titleId} className={styles.objectsOverlayTitle}>
							{title}
						</h2>
						{extra ? <div className={styles.objectsOverlayHeaderActions}>{extra}</div> : null}
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						className={styles.objectsOverlayClose}
						onClick={onClose}
						aria-label="Close"
					>
						<CloseOutlined />
					</button>
				</div>
				<div className={resolvedBodyClassName}>{children}</div>
			</div>
		</div>,
		document.body,
	)
}
