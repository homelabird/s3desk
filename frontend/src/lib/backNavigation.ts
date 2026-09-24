/** Finite mobile Back layers. One synthetic entry protects local UI state;
 * when no local layer remains, normal browser/router navigation is untouched.
 * No permanent popstate trap and no privileged native bridge are installed.
 */
const markerKey = '__s3deskMobileBackV1'
type Layer = { id: symbol; priority: number; order: number; href: string; close: () => void }
type Marker = { id: string; href: string; baseIndex?: number }
const objectState = (value: unknown): Record<string, unknown> =>
	value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
const indexOf = (value: unknown): number | undefined => {
	const index = objectState(value).idx
	return typeof index === 'number' && Number.isFinite(index) ? index : undefined
}

export class MobileBackCoordinator {
	private layers = new Map<symbol, Layer>()
	private marker: Marker | null = null
	private retired = new Set<string>()
	private pendingClose: Marker | null = null
	private timer: number | undefined
	private sequence = 0
	private lastIndex: number | undefined
	private disposed = false

	private readonly host: Window

	constructor(host: Window) {
		this.host = host
		this.lastIndex = indexOf(host.history.state)
		// Capture only our own same-URL entries before the router handles them.
		host.addEventListener('popstate', this.onPopState, true)
	}

	register(priority: number, close: () => void): () => void {
		const id = Symbol('mobile-back-layer')
		this.layers.set(id, { id, priority, close, order: ++this.sequence, href: this.host.location.href })
		this.schedule()
		return () => { this.layers.delete(id); this.schedule() }
	}

	private top(): Layer | undefined {
		return Array.from(this.layers.values())
			.filter((layer) => layer.href === this.host.location.href)
			.sort((a, b) => b.priority - a.priority || b.order - a.order)[0]
	}

	/** For a trusted host's Back event: false means use ordinary navigation. */
	requestBack(): boolean {
		if (!this.marker || !this.top() || objectState(this.host.history.state)[markerKey] !== this.marker.id) return false
		this.host.history.back()
		return true
	}

	private schedule() {
		if (this.disposed || this.timer !== undefined) return
		this.timer = this.host.setTimeout(() => { this.timer = undefined; this.sync() }, 0)
	}

	private retire(id: string) {
		this.retired.add(id)
		// Markers in browser history are also recognizable by the session prefix;
		// this bounded set only optimizes the common case.
		if (this.retired.size > 256) this.retired.delete(this.retired.values().next().value!)
	}

	private sync() {
		if (this.disposed || !this.host.history || this.pendingClose) return
		const state = objectState(this.host.history.state)
		const currentMarker = state[markerKey]
		this.lastIndex = indexOf(state)
		if (this.marker && (currentMarker !== this.marker.id || this.host.location.href !== this.marker.href)) {
			this.retire(this.marker.id)
			this.marker = null
		}
		const top = this.top()
		if (this.marker) {
			if (!top) {
				this.pendingClose = this.marker
				this.retire(this.marker.id)
				this.marker = null
				this.host.history.back()
			}
			return
		}
		if (!top) return
		const id = `s3desk:${Date.now()}:${++this.sequence}`
		const baseIndex = indexOf(state)
		try {
			this.host.history.pushState({ ...state, [markerKey]: id, ...(baseIndex === undefined ? {} : { idx: baseIndex + 1 }) }, '', this.host.location.href)
			this.marker = { id, href: this.host.location.href, baseIndex }
			this.lastIndex = indexOf(this.host.history.state)
		} catch {
			// Sandboxed/restricted hosts may reject History API writes. Do not
			// block the user's Back button; the normal close buttons still work.
		}
	}

	private onPopState = (event: PopStateEvent) => {
		const state = objectState(event.state)
		const targetIndex = indexOf(state)
		const targetMarker = state[markerKey]
		const isMarker = typeof targetMarker === 'string' && (this.retired.has(targetMarker) || targetMarker.startsWith('s3desk:'))
		if (isMarker && targetMarker !== this.marker?.id) {
			if (targetIndex !== undefined && this.lastIndex !== undefined && targetIndex !== this.lastIndex) {
				event.stopImmediatePropagation()
				const movingBackward = targetIndex < this.lastIndex
				this.lastIndex = targetIndex
				if (movingBackward) this.host.history.back()
				else this.host.history.forward()
				return
			}
			// Forward must not reopen closed dialogs or stop on their same-URL entries.
			const clean = { ...state }
			delete clean[markerKey]
			this.host.history.replaceState(clean, '', this.host.location.href)
		}
		const closing = this.pendingClose ?? this.marker
		if (closing && this.host.location.href === closing.href && targetMarker !== closing.id &&
			(closing.baseIndex === undefined || targetIndex === closing.baseIndex)) {
			event.stopImmediatePropagation()
			const silent = this.pendingClose !== null
			this.pendingClose = null
			this.retire(closing.id)
			this.marker = null
			this.lastIndex = targetIndex
			if (!silent) this.top()?.close()
			// Registration uses layout effects so the next tick observes the
			// committed UI, including a newly empty selection/folder history.
			this.schedule()
			return
		}
		// A real route transition belongs to the router, not to our layers.
		if (this.marker && targetMarker !== this.marker.id) {
			this.retire(this.marker.id)
			this.marker = null
		}
		this.pendingClose = null
		this.lastIndex = targetIndex
	}

	dispose() {
		this.disposed = true
		if (this.timer !== undefined) this.host.clearTimeout(this.timer)
		this.host.removeEventListener('popstate', this.onPopState, true)
		this.layers.clear()
	}
}

let coordinator: MobileBackCoordinator | undefined
export function getMobileBackCoordinator(): MobileBackCoordinator | undefined {
	if (typeof window === 'undefined') return undefined
	coordinator ??= new MobileBackCoordinator(window)
	return coordinator
}
