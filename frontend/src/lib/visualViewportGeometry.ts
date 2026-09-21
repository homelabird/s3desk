export type ViewportGeometry = { height: number; top: number }
export function getVisualViewportGeometry(layoutHeight: number, viewport?: { height: number; offsetTop: number; scale: number } | null): ViewportGeometry {
	const fallback = Number.isFinite(layoutHeight) && layoutHeight > 0 ? layoutHeight : 1
	// Do not shrink/reposition the layout to follow pinch zoom. Zoom must remain usable.
	if (!viewport || !Number.isFinite(viewport.scale) || Math.abs(viewport.scale - 1) > 0.05 ||
		!Number.isFinite(viewport.height) || viewport.height <= 0) return { height: fallback, top: 0 }
	const height = Math.min(fallback, viewport.height)
	const top = Number.isFinite(viewport.offsetTop) ? Math.max(0, Math.min(viewport.offsetTop, fallback - height)) : 0
	return { height, top }
}
