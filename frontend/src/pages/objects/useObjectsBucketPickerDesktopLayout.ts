import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'

type UseObjectsBucketPickerDesktopLayoutParams = {
	open: boolean
	onClose: () => void
}

type DesktopPopoverLayout = {
	width: number
	maxBodyHeight: number
	align: 'left' | 'right'
}

type TabDirection = 'forward' | 'backward'

const DESKTOP_POPOVER_MIN_WIDTH = 380
const DESKTOP_POPOVER_DEFAULT_WIDTH = 440
const DESKTOP_POPOVER_MAX_WIDTH = 560
const DESKTOP_POPOVER_VIEWPORT_GUTTER = 16
const DESKTOP_POPOVER_TRIGGER_EXPANSION = 120
const DESKTOP_POPOVER_BODY_MIN_HEIGHT = 180
const DESKTOP_POPOVER_BODY_MAX_HEIGHT = 420
const FOCUSABLE_SELECTOR = [
	'a[href]',
	'button:not([disabled])',
	'input:not([disabled])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'[tabindex]:not([tabindex="-1"])',
].join(',')

export function useObjectsBucketPickerDesktopLayout({ onClose, open }: UseObjectsBucketPickerDesktopLayoutParams) {
	const desktopRootRef = useRef<HTMLDivElement>(null)
	const desktopTriggerRef = useRef<HTMLButtonElement>(null)
	const desktopInputRef = useRef<HTMLInputElement>(null)
	const lastTabDirectionRef = useRef<TabDirection | null>(null)
	const [desktopPopoverLayout, setDesktopPopoverLayout] = useState<DesktopPopoverLayout>({
		width: DESKTOP_POPOVER_DEFAULT_WIDTH,
		maxBodyHeight: DESKTOP_POPOVER_BODY_MAX_HEIGHT,
		align: 'left',
	})

	const updateDesktopPopoverLayout = useCallback(() => {
		const rootEl = desktopRootRef.current
		const triggerEl = desktopTriggerRef.current
		if (!rootEl || !triggerEl) return

		const rootRect = rootEl.getBoundingClientRect()
		const triggerRect = triggerEl.getBoundingClientRect()
		const viewportWidth = window.innerWidth
		const viewportHeight = window.innerHeight
		const availableViewportWidth = Math.max(300, viewportWidth - DESKTOP_POPOVER_VIEWPORT_GUTTER * 2)
		const minWidth = Math.min(DESKTOP_POPOVER_MIN_WIDTH, availableViewportWidth)
		const maxWidth = Math.min(DESKTOP_POPOVER_MAX_WIDTH, availableViewportWidth)
		const desiredWidth = Math.max(
			minWidth,
			Math.min(maxWidth, Math.max(DESKTOP_POPOVER_DEFAULT_WIDTH, triggerRect.width + DESKTOP_POPOVER_TRIGGER_EXPANSION)),
		)
		const wouldOverflowRight = rootRect.left + desiredWidth > viewportWidth - DESKTOP_POPOVER_VIEWPORT_GUTTER
		const canAlignRight = rootRect.right - desiredWidth >= DESKTOP_POPOVER_VIEWPORT_GUTTER
		const align: DesktopPopoverLayout['align'] = wouldOverflowRight && canAlignRight ? 'right' : 'left'
		const availableBelow = viewportHeight - triggerRect.bottom - 24
		const maxBodyHeight = Math.max(DESKTOP_POPOVER_BODY_MIN_HEIGHT, Math.min(DESKTOP_POPOVER_BODY_MAX_HEIGHT, availableBelow))

		setDesktopPopoverLayout((current) => {
			if (current.width === desiredWidth && current.maxBodyHeight === maxBodyHeight && current.align === align) {
				return current
			}
			return { width: desiredWidth, maxBodyHeight, align }
		})
	}, [])

	const trapDesktopFocus = useCallback((event: KeyboardEvent | ReactKeyboardEvent<HTMLElement>) => {
		const root = desktopRootRef.current
		if (!root) return
		lastTabDirectionRef.current = event.shiftKey ? 'backward' : 'forward'
		const focusableElements = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
		if (focusableElements.length === 0) return
		const firstElement = focusableElements[0]
		const lastElement = focusableElements[focusableElements.length - 1]
		const triggerElement = desktopTriggerRef.current
		const activeElement = document.activeElement
		if (event.shiftKey) {
			if (activeElement === firstElement || activeElement === triggerElement || !root.contains(activeElement)) {
				event.preventDefault()
				lastElement.focus()
			}
			return
		}
		if (activeElement === lastElement) {
			event.preventDefault()
			const nextElement = triggerElement ?? firstElement
			nextElement.focus()
		}
	}, [])

	const restoreEscapedTabFocus = useCallback((direction: TabDirection) => {
		const root = desktopRootRef.current
		if (!root) return
		const focusableElements = Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
		if (focusableElements.length === 0) return
		const firstElement = focusableElements[0]
		const lastElement = focusableElements[focusableElements.length - 1]
		if (direction === 'backward') {
			lastElement.focus()
			return
		}
		const nextElement = desktopTriggerRef.current ?? firstElement
		nextElement.focus()
	}, [])

	const handleDesktopRootKeyDownCapture = useCallback(
		(event: ReactKeyboardEvent<HTMLDivElement>) => {
			if (event.key !== 'Tab') return
			trapDesktopFocus(event)
		},
		[trapDesktopFocus],
	)

	const handleDesktopTriggerKeyDown = useCallback(
		(event: ReactKeyboardEvent<HTMLButtonElement>) => {
			if (event.key !== 'Tab') return
			trapDesktopFocus(event)
		},
		[trapDesktopFocus],
	)

	useEffect(() => {
		if (!open) return
		updateDesktopPopoverLayout()
		desktopInputRef.current?.focus()

		const rootEl = desktopRootRef.current
		const triggerEl = desktopTriggerRef.current
		const resizeObserver =
			typeof ResizeObserver !== 'undefined'
				? new ResizeObserver(() => {
						updateDesktopPopoverLayout()
					})
				: null
		if (resizeObserver && rootEl) resizeObserver.observe(rootEl)
		if (resizeObserver && triggerEl) resizeObserver.observe(triggerEl)

		const handlePointerDown = (event: PointerEvent) => {
			if (desktopRootRef.current?.contains(event.target as Node)) return
			onClose()
		}
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === 'Escape') {
				event.preventDefault()
				onClose()
				return
			}
			if (event.key !== 'Tab') return
			trapDesktopFocus(event)
		}
		const handleFocusIn = (event: FocusEvent) => {
			const root = desktopRootRef.current
			if (!root || root.contains(event.target as Node)) return
			const direction = lastTabDirectionRef.current
			if (!direction) return
			restoreEscapedTabFocus(direction)
		}
		const handleWindowResize = () => updateDesktopPopoverLayout()
		document.addEventListener('pointerdown', handlePointerDown)
		document.addEventListener('keydown', handleKeyDown, true)
		document.addEventListener('focusin', handleFocusIn, true)
		window.addEventListener('resize', handleWindowResize)
		window.addEventListener('scroll', handleWindowResize, true)
		return () => {
			document.removeEventListener('pointerdown', handlePointerDown)
			document.removeEventListener('keydown', handleKeyDown, true)
			document.removeEventListener('focusin', handleFocusIn, true)
			window.removeEventListener('resize', handleWindowResize)
			window.removeEventListener('scroll', handleWindowResize, true)
			resizeObserver?.disconnect()
		}
	}, [onClose, open, restoreEscapedTabFocus, trapDesktopFocus, updateDesktopPopoverLayout])

	return {
		desktopInputRef,
		desktopPopoverLayout,
		desktopRootRef,
		desktopTriggerRef,
		handleDesktopRootKeyDownCapture,
		handleDesktopTriggerKeyDown,
	}
}
