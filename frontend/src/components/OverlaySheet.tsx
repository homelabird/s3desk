import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'

import styles from './OverlaySheet.module.css'

type Props = {
	open: boolean
	onClose: () => void
	title: ReactNode
	placement: 'left' | 'right' | 'bottom'
	width?: number | string
	height?: number | string
	dataTestId?: string
	extra?: ReactNode
	footer?: ReactNode
	children: ReactNode
	bodyClassName?: string
	panelClassName?: string
}

export function OverlaySheet(props: Props) {
	const {
		open,
		onClose,
		title,
		placement,
		width,
		height,
		dataTestId,
		extra,
		footer,
		children,
		bodyClassName,
		panelClassName,
	} = props
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
	}, [onClose, open])

	useEffect(() => {
		if (!open) return
		closeButtonRef.current?.focus()
	}, [open])

	if (!open || typeof document === 'undefined') return null

	const panelStyle: CSSProperties =
		placement === 'right' || placement === 'left' ? { width: width ?? '100%' } : { height: height ?? 'auto' }

	return createPortal(
		<div
			className={[
				styles.backdrop,
				placement === 'right' ? styles.backdropRight : placement === 'left' ? styles.backdropLeft : styles.backdropBottom,
			].join(' ')}
			onMouseDown={onClose}
		>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
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
							<button ref={closeButtonRef} type="button" className={styles.close} onClick={onClose} aria-label="Close">
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
