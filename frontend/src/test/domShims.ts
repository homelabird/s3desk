export function ensureDomShims() {
	if (!('ResizeObserver' in globalThis)) {
		class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		}
		globalThis.ResizeObserver = ResizeObserver
	}
	if (!('scrollTo' in Element.prototype)) {
		Object.defineProperty(Element.prototype, 'scrollTo', {
			value: () => {},
			writable: true,
		})
	}
	if (typeof window !== 'undefined') {
		const originalGetComputedStyle = window.getComputedStyle
		window.getComputedStyle = (elt: Element) => originalGetComputedStyle(elt)
	}
}
