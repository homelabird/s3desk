import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from 'react'

import styles from './PopoverSurface.module.css'

export type PopoverOpenSource = 'trigger' | 'content' | 'menu' | 'outside'
type PopoverViewportRect = Pick<DOMRectReadOnly, 'top' | 'left' | 'right' | 'bottom' | 'width' | 'height'>
type PopoverSafeAreaInsets = Record<'top' | 'right' | 'bottom' | 'left', number>
type DivElementProps = HTMLAttributes<HTMLDivElement> & {
	[key: `data-${string}`]: string | number | undefined
}

type Props = {
	align?: 'start' | 'end'
	className?: string
	contentClassName?: string
	contentStyle?: CSSProperties
	contentProps?: DivElementProps
	getViewportRect?: (anchorElement: HTMLDivElement) => PopoverViewportRect | null
	open?: boolean
	onOpenChange?: (open: boolean, info?: { source: PopoverOpenSource }) => void
	rootProps?: DivElementProps
	children: (args: {
		open: boolean
		toggle: () => void
		close: () => void
		setOpen: (next: boolean, source?: PopoverOpenSource) => void
	}) => ReactNode
	content: (args: { close: (source?: PopoverOpenSource) => void }) => ReactNode
}

function parseCssPixelValue(value: string) {
	const parsed = Number.parseFloat(value)
	return Number.isFinite(parsed) ? parsed : 0
}

function createSafeAreaProbe() {
	if (typeof document === 'undefined') return null
	const container = document.body ?? document.documentElement
	if (!container) return null
	const probe = document.createElement('div')
	probe.setAttribute('data-popover-safe-area-probe', 'true')
	Object.assign(probe.style, {
		position: 'fixed',
		top: '0',
		left: '0',
		width: '0',
		height: '0',
		paddingTop: 'env(safe-area-inset-top)',
		paddingRight: 'env(safe-area-inset-right)',
		paddingBottom: 'env(safe-area-inset-bottom)',
		paddingLeft: 'env(safe-area-inset-left)',
		visibility: 'hidden',
		pointerEvents: 'none',
	})
	container.appendChild(probe)
	return probe
}

function getWindowSafeAreaInsets(safeAreaProbe: HTMLDivElement | null): PopoverSafeAreaInsets {
	if (!safeAreaProbe || typeof window === 'undefined') {
		return { top: 0, right: 0, bottom: 0, left: 0 }
	}
	const safeAreaStyles = window.getComputedStyle(safeAreaProbe)
	return {
		top: parseCssPixelValue(safeAreaStyles.paddingTop),
		right: parseCssPixelValue(safeAreaStyles.paddingRight),
		bottom: parseCssPixelValue(safeAreaStyles.paddingBottom),
		left: parseCssPixelValue(safeAreaStyles.paddingLeft),
	}
}

function getWindowViewportRect(safeAreaProbe: HTMLDivElement | null): PopoverViewportRect {
	const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0
	const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0
	const safeAreaInsets = getWindowSafeAreaInsets(safeAreaProbe)
	const left = safeAreaInsets.left
	const top = safeAreaInsets.top
	const right = Math.max(left, viewportWidth - safeAreaInsets.right)
	const bottom = Math.max(top, viewportHeight - safeAreaInsets.bottom)
	return {
		top,
		left,
		right,
		bottom,
		width: Math.max(0, right - left),
		height: Math.max(0, bottom - top),
	}
}

export function PopoverSurface(props: Props) {
	const {
		align,
		children,
		className,
		content,
		contentClassName,
		contentProps,
		contentStyle,
		getViewportRect,
		onOpenChange,
		open: controlledOpen,
		rootProps,
	} = props
	const [internalOpen, setInternalOpen] = useState(false)
	const [anchorElement, setAnchorElement] = useState<HTMLDivElement | null>(null)
	const panelRef = useRef<HTMLDivElement>(null)
	const open = controlledOpen ?? internalOpen
	const isControlled = typeof controlledOpen === 'boolean'

	const setOpen = useCallback(
		(next: boolean, source: PopoverOpenSource = 'outside') => {
			if (!isControlled) setInternalOpen(next)
			onOpenChange?.(next, { source })
		},
		[isControlled, onOpenChange],
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
		let safeAreaProbe: HTMLDivElement | null = null
		const updatePosition = () => {
			const viewportPadding = 16
			const customViewportRect = getViewportRect?.(anchorElement)
			if (!customViewportRect && !safeAreaProbe) safeAreaProbe = createSafeAreaProbe()
			const viewportRect = customViewportRect ?? getWindowViewportRect(safeAreaProbe)
			panel.style.setProperty('--popover-available-width', `${Math.max(0, viewportRect.width - viewportPadding * 2)}px`)
			panel.style.setProperty('--popover-available-height', `${Math.max(0, viewportRect.height - viewportPadding * 2)}px`)
			const anchorRect = anchorElement.getBoundingClientRect()
			const panelRect = panel.getBoundingClientRect()
			const minLeft = viewportRect.left + viewportPadding
			const maxLeft = Math.max(minLeft, viewportRect.right - panelRect.width - viewportPadding)
			const left =
				align === 'end'
					? Math.min(maxLeft, Math.max(minLeft, anchorRect.right - panelRect.width))
					: Math.min(maxLeft, Math.max(minLeft, anchorRect.left))
			const minTop = viewportRect.top + viewportPadding
			const maxTop = Math.max(minTop, viewportRect.bottom - panelRect.height - viewportPadding)
			const top = Math.min(Math.max(minTop, anchorRect.bottom + 8), maxTop)
			Object.assign(panel.style, {
				position: 'fixed',
				top: `${top}px`,
				left: `${left}px`,
				right: 'auto',
				bottom: 'auto',
				visibility: 'visible',
			})
		}
		updatePosition()
		window.addEventListener('resize', updatePosition)
		window.addEventListener('scroll', updatePosition, true)
		return () => {
			window.removeEventListener('resize', updatePosition)
			window.removeEventListener('scroll', updatePosition, true)
			safeAreaProbe?.remove()
		}
	}, [align, anchorElement, getViewportRect, open])

	return (
		<div
			ref={setAnchorElement}
			{...rootProps}
			className={[styles.root, open ? styles.rootOpen : '', className ?? '', rootProps?.className ?? ''].filter(Boolean).join(' ')}
		>
			{children({ open, toggle, close: () => close('outside'), setOpen })}
			{open && typeof document !== 'undefined'
				? createPortal(
						<div
							ref={panelRef}
							{...contentProps}
							className={[styles.panel, contentClassName ?? '', contentProps?.className ?? ''].filter(Boolean).join(' ')}
							style={{ ...contentStyle, position: 'fixed', top: 16, left: 16, visibility: 'hidden' }}
						>
							{content({ close })}
						</div>,
						document.body,
					)
				: null}
		</div>
	)
}
