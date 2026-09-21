import { describe, expect, it } from 'vitest'

import { getObjectsGridLayout } from '../objectsGridLayout'
import { COMPACT_ROW_HEIGHT_PX, WIDE_ROW_HEIGHT_PX, WIDE_LIST_THUMBNAIL_PX, GRID_CARD_THUMBNAIL_PX } from '../objectsPageConstants'

describe('container-based object density', () => {
	it.each([760, 778, 788, 874, 1054, 1214, 1390, 1694])('fits at least eight cards in a %ipx desktop list', (width) => {
		const layout = getObjectsGridLayout(width)
		expect(layout.columns).toBeGreaterThanOrEqual(8)
		expect(layout.cardWidth).toBeGreaterThanOrEqual(88)
		expect(layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap + layout.padding * 2).toBeCloseTo(width)
	})

	it.each([294, 304, 344, 364, 386, 464])('keeps four or more mobile cards within %ipx', (width) => {
		const layout = getObjectsGridLayout(width)
		expect(layout.columns).toBeGreaterThanOrEqual(4)
		expect(layout.cardWidth).toBeGreaterThanOrEqual(60)
		expect(layout.cardWidth * layout.columns + layout.gap * (layout.columns - 1) + layout.padding * 2).toBeCloseTo(width)
	})

	it('responds to a sidebar resize without reading window dimensions', () => {
		expect(getObjectsGridLayout(788).columns).toBe(8)
		expect(getObjectsGridLayout(1120).columns).toBe(10)
		expect(getObjectsGridLayout(788).columns).toBe(8)
	})

	it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('uses safe initial geometry for %s', (width) => {
		const layout = getObjectsGridLayout(width)
		expect(layout.columns).toBe(1)
		expect(layout.cardWidth).toBe(0)
	})

	it('never loses columns when the list grows across density breakpoints', () => {
		let previous = 0
		for (let width = 280; width <= 3840; width++) {
			const columns = getObjectsGridLayout(width).columns
			expect(columns).toBeGreaterThanOrEqual(previous)
			previous = columns
		}
	})

	it('has no arbitrary maximum column count on ultrawide lists', () => {
		expect(getObjectsGridLayout(3000).columns).toBeGreaterThan(16)
	})

	it('shares compact row estimates and smaller thumbnails with the renderers', () => {
		expect(WIDE_ROW_HEIGHT_PX).toBe(44)
		expect(COMPACT_ROW_HEIGHT_PX).toBe(52)
		expect(WIDE_LIST_THUMBNAIL_PX).toBeLessThan(WIDE_ROW_HEIGHT_PX - 8)
		expect(GRID_CARD_THUMBNAIL_PX).toBe(48)
	})
})
