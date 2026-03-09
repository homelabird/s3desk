import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'

import styles from './objects.module.css'

type ObjectsOverlaySheetProps = {
	open: boolean
	onClose: () => void
	title: string
	placement: 'left' | 'right' | 'bottom'
	width?: number | string
	height?: number | string
	dataTestId?: string
	extra?: ReactNode
	children: ReactNode
	bodyClassName?: string
	panelClassName?: string
}

export function ObjectsOverlaySheet(props: ObjectsOverlaySheetProps) {
	const { open, onClose, title, placement, width, height, dataTestId, extra, children, bodyClassName, panelClassName } = props
	const titleId = useId()
	const closeButtonRef = useRef<HTMLButtonElement>(null)

	useEffect(() => {
		if (!open || typeof document === 'undefined') return
		const previousOverflow = document.body.style.overflow
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			onClose()
		}
		document.body.style.overflow = 'hidden'
		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.body.style.overflow = previousOverflow
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [open, onClose])

	useEffect(() => {
		if (!open) return
		closeButtonRef.current?.focus()
	}, [open])

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
			className={[
				styles.objectsOverlayBackdrop,
				placement === 'right'
					? styles.objectsOverlayBackdropRight
					: placement === 'left'
						? styles.objectsOverlayBackdropLeft
						: styles.objectsOverlayBackdropBottom,
			].join(' ')}
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
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
