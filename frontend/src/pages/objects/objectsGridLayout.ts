/** Container-based geometry shared by the virtualizer and the rendered CSS grid.
 * A docked tree/details pane or the app sidebar can resize the list without a
 * window resize. Do not derive columns from window.innerWidth.
 */
export function getObjectsGridLayout(containerWidth: number) {
	const width = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0
	const density = width <= 480 ? 'narrow' : width < 760 ? 'compact' : 'regular'
	const padding = density === 'narrow' ? 4 : 6
	const gap = density === 'narrow' ? 4 : 6
	const contentWidth = Math.max(0, width - padding * 2)
	// Keep a single target width so crossing a density breakpoint cannot
	// reduce the number of columns as more space becomes available.
	const preferredCardWidth = 100
	const naturalColumns = Math.max(1, Math.floor((contentWidth + gap) / (preferredCardWidth + gap)))
	// Four cards at the supported 320px mobile viewport; eight once the actual
	// list has 760px (including a 1280px desktop with the default docked tree).
	// Extremely narrow embeds may use fewer columns rather than overflow.
	const minimumColumns = width >= 760 ? 8 : width >= 280 ? 4 : 1
	const columns = Math.max(minimumColumns, naturalColumns)
	return {
		density,
		columns,
		padding,
		gap,
		cardWidth: Math.max(0, (contentWidth - gap * (columns - 1)) / columns),
		estimatedRowHeight: density === 'narrow' ? 148 : 188,
	} as const
}
