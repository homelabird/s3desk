import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

import styles from './PopoverSurface.module.css'

export type PopoverOpenSource = 'trigger' | 'content' | 'menu' | 'outside'

type Props = {
	align?: 'start' | 'end'
	className?: string
	contentClassName?: string
	contentStyle?: CSSProperties
	contentProps?: HTMLAttributes<HTMLDivElement>
	open?: boolean
	onOpenChange?: (open: boolean, info?: { source: PopoverOpenSource }) => void
	rootProps?: HTMLAttributes<HTMLDivElement>
	children: (args: {
		open: boolean
		toggle: () => void
		close: () => void
		setOpen: (next: boolean, source?: PopoverOpenSource) => void
	}) => ReactNode
	content: (args: { close: (source?: PopoverOpenSource) => void }) => ReactNode
}

export function PopoverSurface(props: Props) {
	const [internalOpen, setInternalOpen] = useState(false)
	const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const open = props.open ?? internalOpen
	const isControlled = typeof props.open === 'boolean'

	const setOpen = useCallback(
		(next: boolean, source: PopoverOpenSource = 'outside') => {
			if (!isControlled) setInternalOpen(next)
			props.onOpenChange?.(next, { source })
		},
		[isControlled, props],
	)
	const close = useCallback((source: PopoverOpenSource = 'outside') => setOpen(false, source), [setOpen])
	const toggle = useCallback(() => setOpen(!open, 'trigger'), [open, setOpen])

	useEffect(() => {
		if (!open) return
		const handlePointerDown = (event: PointerEvent) => {
			const target = event.target as Node
			if (anchorElement?.contains(target)) return
			if (panelRef.current?.contains(target)) return
			setOpen(false, 'outside')
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key !== 'Escape') return
			event.preventDefault()
			setOpen(false, 'outside')
		}
		document.addEventListener('pointerdown', handlePointerDown)
		document.addEventListener('keydown', handleKeyDown)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
			document.removeEventListener('keydown', handleKeyDown)
		}
	}, [anchorElement, open, setOpen])

	useLayoutEffect(() => {
		if (!open || typeof window === 'undefined' || !anchorElement || !panelRef.current) return
		const panel = panelRef.current
		const updatePosition = () => {
			const viewportPadding = 16
			const anchorRect = anchorElement.getBoundingClientRect()
			const panelRect = panel.getBoundingClientRect()
			const maxLeft = Math.max(viewportPadding, window.innerWidth - panelRect.width - viewportPadding)
			const left =
				props.align === 'end'
					? Math.min(maxLeft, Math.max(viewportPadding, anchorRect.right - panelRect.width))
					: Math.min(maxLeft, Math.max(viewportPadding, anchorRect.left))
			const top = Math.min(
				Math.max(viewportPadding, anchorRect.bottom + 8),
				Math.max(viewportPadding, window.innerHeight - panelRect.height - viewportPadding),
			)
			Object.assign(panel.style, {
				position: 'fixed',
				top: `${top}px`,
				left: `${left}px`,
				right: 'auto',
				visibility: 'visible',
			})
		}
		updatePosition()
		window.addEventListener('resize', updatePosition)
		window.addEventListener('scroll', updatePosition, true)
		return () => {
			window.removeEventListener('resize', updatePosition)
			window.removeEventListener('scroll', updatePosition, true)
		}
	}, [anchorElement, open, props.align])

	return (
		<div
			ref={setAnchorElement}
			{...props.rootProps}
			className={[styles.root, open ? styles.rootOpen : '', props.className ?? '', props.rootProps?.className ?? ''].filter(Boolean).join(' ')}
		>
			{props.children({ open, toggle, close: () => close('outside'), setOpen })}
			{open && typeof document !== 'undefined'
				? createPortal(
						<div
							ref={panelRef}
							{...props.contentProps}
							className={[styles.panel, props.contentClassName ?? '', props.contentProps?.className ?? ''].filter(Boolean).join(' ')}
							style={{ ...props.contentStyle, position: 'fixed', top: 16, left: 16, visibility: 'hidden' }}
						>
							{props.content({ close })}
						</div>,
						document.body,
					)
				: null}
		</div>
	)
}
