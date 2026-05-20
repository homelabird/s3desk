import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useId, useRef, type CSSProperties, type ReactNode } from 'react'

import styles from './OverlaySheet.module.css'
import { useOverlayLayer } from './useOverlayLayer'

type Props = {
	open: boolean
	onClose: () => void
	title: ReactNode
	placement: 'left' | 'right' | 'bottom'
	width?: number | string
	height?: number | string
	sheetId?: string
	dataTestId?: string
	extra?: ReactNode
	footer?: ReactNode
	closeDisabled?: boolean
	children: ReactNode
	bodyClassName?: string
	panelClassName?: string
	initialFocusSelector?: string
}

export function OverlaySheet(props: Props) {
	const {
		open,
		onClose,
		title,
		placement,
		width,
		height,
		sheetId,
		dataTestId,
		extra,
		footer,
		closeDisabled = false,
		children,
		bodyClassName,
		panelClassName,
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
		placement === 'right' || placement === 'left' ? { width: width ?? '100%' } : { height: height ?? 'auto' }

	return createPortal(
		<div
			className={[
				styles.backdrop,
				placement === 'right' ? styles.backdropRight : placement === 'left' ? styles.backdropLeft : styles.backdropBottom,
			].join(' ')}
			onMouseDown={handleClose}
		>
			<div
				ref={panelRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
				id={sheetId}
				tabIndex={-1}
				data-testid={dataTestId}
				className={[
					styles.panel,
					placement === 'right' ? styles.panelRight : placement === 'left' ? styles.panelLeft : styles.panelBottom,
					panelClassName ?? '',
				]
					.filter(Boolean)
					.join(' ')}
				style={panelStyle}
				onMouseDown={(event) => event.stopPropagation()}
			>
				<div className={styles.header}>
					<div className={styles.headerMain}>
						<h2 id={titleId} className={styles.title}>
							{title}
						</h2>
						<div className={styles.actions}>
							{extra}
							<button
								ref={closeButtonRef}
								type="button"
								className={styles.close}
								onClick={handleClose}
								disabled={closeDisabled}
								aria-label={closeDisabled ? 'Close disabled while busy' : 'Close'}
								title={closeDisabled ? 'Finish the current selection first' : 'Close'}
							>
								<CloseOutlined />
							</button>
						</div>
					</div>
				</div>
				<div className={[styles.body, bodyClassName ?? ''].filter(Boolean).join(' ')}>{children}</div>
				{footer ? <div className={styles.footer}>{footer}</div> : null}
			</div>
		</div>,
		document.body,
	)
}
