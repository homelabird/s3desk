import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useId, useRef, type CSSProperties, type ReactNode } from 'react'

import styles from './DialogModal.module.css'
import { useOverlayLayer } from './useOverlayLayer'

const dialogWidthVar = '--dialog-width' as const

type Props = {
	open: boolean
	onClose: () => void
	title: ReactNode
	subtitle?: ReactNode
	width?: number | string
	footer?: ReactNode
	dataTestId?: string
	closeDisabled?: boolean
	initialFocusSelector?: string
	children: ReactNode
}

export function DialogModal(props: Props) {
	const {
		open,
		onClose,
		title,
		subtitle,
		width,
		footer,
		dataTestId,
		closeDisabled = false,
		initialFocusSelector,
		children,
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

	const panelStyle = {
		[dialogWidthVar]: typeof width === 'number' ? `${width}px` : width ?? '720px',
	} as CSSProperties

	return createPortal(
		<div className={styles.backdrop} onMouseDown={handleClose}>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				tabIndex={-1}
				className={styles.panel}
				style={panelStyle}
				data-testid={dataTestId}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className={styles.header}>
					<div className={styles.titleBlock}>
						<h2 id={titleId} className={styles.title}>
							{title}
						</h2>
						{subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
					</div>
					<button
						ref={closeButtonRef}
						type="button"
						className={styles.close}
						onClick={handleClose}
						disabled={closeDisabled}
						aria-label={closeDisabled ? 'Close disabled while busy' : 'Close'}
						title={closeDisabled ? 'Finish the current operation first' : 'Close'}
					>
						<CloseOutlined />
					</button>
				</div>
				<div className={styles.body}>{children}</div>
				{footer ? <div className={styles.footer}>{footer}</div> : null}
			</div>
		</div>,
		document.body,
	)
}
