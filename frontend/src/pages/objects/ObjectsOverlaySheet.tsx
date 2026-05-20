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
	closeDisabled?: boolean
	children: ReactNode
	bodyClassName?: string
	panelClassName?: string
	compactMobile?: boolean
	initialFocusSelector?: string
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
		closeDisabled = false,
		children,
		bodyClassName,
		panelClassName,
		compactMobile = false,
		initialFocusSelector,
	} = props
	const titleId = useId()
	const closeButtonRef = useRef<HTMLButtonElement>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const handleClose = () => {
		if (closeDisabled) return
		onClose()
	}

	useOverlayLayer({
		open,
		onEscape: handleClose,
		containerRef: panelRef,
		initialFocusRef: closeButtonRef,
		initialFocusSelector,
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

	const resolvedHeaderClassName = [
		styles.objectsOverlayHeader,
		compactMobile ? styles.objectsOverlayHeaderCompactMobile : '',
	]
		.filter(Boolean)
		.join(' ')

	const resolvedBodyClassName = [
		styles.objectsOverlayBody,
		compactMobile ? styles.objectsOverlayBodyCompactMobile : '',
		bodyClassName ?? '',
	]
		.filter(Boolean)
		.join(' ')
	const headerTestId = dataTestId ? `${dataTestId}-header` : undefined
	const bodyTestId = dataTestId ? `${dataTestId}-body` : undefined

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
			onMouseDown={backdropInteractive ? handleClose : undefined}
		>
			<div
				ref={panelRef}
				id={sheetId}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				data-testid={dataTestId}
				data-compact-mobile={compactMobile ? 'true' : 'false'}
				className={resolvedPanelClassName}
				style={panelStyle}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className={resolvedHeaderClassName} data-testid={headerTestId}>
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
						onClick={handleClose}
						disabled={closeDisabled}
						aria-label={closeDisabled ? 'Close disabled while busy' : 'Close'}
						title={closeDisabled ? 'Finish the current operation first' : 'Close'}
					>
						<CloseOutlined />
					</button>
				</div>
				<div className={resolvedBodyClassName} data-testid={bodyTestId}>
					{children}
				</div>
			</div>
		</div>,
		document.body,
	)
}
