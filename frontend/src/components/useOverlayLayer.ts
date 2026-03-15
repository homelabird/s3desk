import { useEffect, useRef, type RefObject } from 'react'

type OverlayLayerRegistration = {
	id: symbol
	onEscape: () => void
	trapFocus: boolean
	getContainer: () => HTMLElement | null
}

type UseOverlayLayerOptions = {
	open: boolean
	onEscape: () => void
	containerRef: RefObject<HTMLElement | null>
	initialFocusRef?: RefObject<HTMLElement | null>
	lockBodyScroll?: boolean
	trapFocus?: boolean
}

const focusableSelector = [
	'a[href]',
	'area[href]',
	'button:not([disabled])',
	'input:not([disabled]):not([type="hidden"])',
	'select:not([disabled])',
	'textarea:not([disabled])',
	'iframe',
	'[tabindex]:not([tabindex="-1"])',
	'[contenteditable="true"]',
].join(', ')

const overlayLayerStack: OverlayLayerRegistration[] = []
let listenersAttached = false
let bodyScrollLockCount = 0
let previousBodyOverflow = ''

function getTopOverlayLayer() {
	return overlayLayerStack[overlayLayerStack.length - 1] ?? null
}

function isFocusableElement(element: HTMLElement) {
	if (element.hidden) return false
	if (element.getAttribute('aria-hidden') === 'true') return false
	if (element.closest('[aria-hidden="true"]')) return false
	if (element.matches(':disabled')) return false
	if (element.tabIndex < 0) return false
	return true
}

function getFocusableElements(container: HTMLElement | null) {
	if (!container) return []
	return Array.from(container.querySelectorAll<HTMLElement>(focusableSelector)).filter(isFocusableElement)
}

function focusElement(element: HTMLElement | null | undefined) {
	if (!element) return false
	element.focus()
	return typeof document !== 'undefined' ? document.activeElement === element : false
}

function scheduleFocusRestore(element: HTMLElement) {
	if (typeof window === 'undefined') {
		element.focus()
		return
	}
	window.setTimeout(() => {
		if (!element.isConnected) return
		element.focus()
	}, 0)
}

function handleOverlayLayerKeyDown(event: KeyboardEvent) {
	const activeOverlayLayer = getTopOverlayLayer()
	if (!activeOverlayLayer) return

	if (event.key === 'Escape') {
		event.preventDefault()
		event.stopPropagation()
		activeOverlayLayer.onEscape()
		return
	}

	if (event.key !== 'Tab' || !activeOverlayLayer.trapFocus) return
	const container = activeOverlayLayer.getContainer()
	if (!container) return

	const focusableElements = getFocusableElements(container)
	const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null

	if (focusableElements.length === 0) {
		event.preventDefault()
		focusElement(container)
		return
	}

	const firstFocusableElement = focusableElements[0]
	const lastFocusableElement = focusableElements[focusableElements.length - 1]

	if (!activeElement || !container.contains(activeElement)) {
		event.preventDefault()
		focusElement(event.shiftKey ? lastFocusableElement : firstFocusableElement)
		return
	}

	if (event.shiftKey && activeElement === firstFocusableElement) {
		event.preventDefault()
		focusElement(lastFocusableElement)
		return
	}

	if (!event.shiftKey && activeElement === lastFocusableElement) {
		event.preventDefault()
		focusElement(firstFocusableElement)
	}
}

function attachOverlayLayerListeners() {
	if (listenersAttached || typeof window === 'undefined') return
	window.addEventListener('keydown', handleOverlayLayerKeyDown, true)
	listenersAttached = true
}

function detachOverlayLayerListeners() {
	if (!listenersAttached || typeof window === 'undefined' || overlayLayerStack.length > 0) return
	window.removeEventListener('keydown', handleOverlayLayerKeyDown, true)
	listenersAttached = false
}

function registerOverlayLayer(registration: OverlayLayerRegistration) {
	overlayLayerStack.push(registration)
	attachOverlayLayerListeners()
}

function unregisterOverlayLayer(id: symbol) {
	const index = overlayLayerStack.findIndex((overlayLayer) => overlayLayer.id === id)
	if (index < 0) return
	overlayLayerStack.splice(index, 1)
	detachOverlayLayerListeners()
}

function lockBodyScroll() {
	if (typeof document === 'undefined' || !document.body) return () => {}
	if (bodyScrollLockCount === 0) previousBodyOverflow = document.body.style.overflow
	bodyScrollLockCount += 1
	document.body.style.overflow = 'hidden'
	return () => {
		if (typeof document === 'undefined' || !document.body) return
		bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1)
		if (bodyScrollLockCount > 0) return
		document.body.style.overflow = previousBodyOverflow
	}
}

export function useOverlayLayer(options: UseOverlayLayerOptions) {
	const onEscapeRef = useRef(options.onEscape)
	const restoreFocusTargetRef = useRef<HTMLElement | null>(null)

	useEffect(() => {
		onEscapeRef.current = options.onEscape
	}, [options.onEscape])

	useEffect(() => {
		if (!options.open || typeof document === 'undefined') return
		const overlayId = Symbol('overlay-layer')
		const containerElement = options.containerRef.current
		restoreFocusTargetRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null

		registerOverlayLayer({
			id: overlayId,
			onEscape: () => onEscapeRef.current(),
			trapFocus: !!options.trapFocus,
			getContainer: () => options.containerRef.current,
		})

		const unlockBodyScroll = options.lockBodyScroll ? lockBodyScroll() : undefined

		return () => {
			const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
			const shouldRestoreFocus =
				!activeElement ||
				activeElement === document.body ||
				activeElement === document.documentElement ||
				!!containerElement?.contains(activeElement)

			unregisterOverlayLayer(overlayId)
			unlockBodyScroll?.()

			const restoreTarget = restoreFocusTargetRef.current
			if (!shouldRestoreFocus || !restoreTarget || !restoreTarget.isConnected) return
			scheduleFocusRestore(restoreTarget)
		}
	}, [options.containerRef, options.lockBodyScroll, options.open, options.trapFocus])

	useEffect(() => {
		if (!options.open) return
		if (focusElement(options.initialFocusRef?.current)) return
		if (focusElement(getFocusableElements(options.containerRef.current)[0])) return
		focusElement(options.containerRef.current)
	}, [options.containerRef, options.initialFocusRef, options.open])
}
