import { CloseOutlined } from '@ant-design/icons'
import { createPortal } from 'react-dom'
import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react'

import styles from './DialogModal.module.css'

const dialogWidthVar = '--dialog-width' as const

type Props = {
	open: boolean
	onClose: () => void
	title: ReactNode
	subtitle?: ReactNode
	width?: number | string
	footer?: ReactNode
	dataTestId?: string
	children: ReactNode
}

export function DialogModal(props: Props) {
	const { open, onClose, title, subtitle, width, footer, dataTestId, children } = props
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

	const panelStyle = {
		[dialogWidthVar]: typeof width === 'number' ? `${width}px` : width ?? '720px',
	} as CSSProperties

	return createPortal(
		<div className={styles.backdrop} onMouseDown={onClose}>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby={titleId}
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
					<button ref={closeButtonRef} type="button" className={styles.close} onClick={onClose} aria-label="Close">
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
