import { describe, expect, it } from 'vitest'
import { getVisualViewportGeometry } from '../visualViewportGeometry'

describe('visual viewport geometry', () => {
	it('follows keyboard height and visual offset', () => {
		expect(getVisualViewportGeometry(844, { height: 420, offsetTop: 80, scale: 1 })).toEqual({ height: 420, top: 80 })
	})
	it('does not turn pinch zoom into a shrunken layout', () => {
		expect(getVisualViewportGeometry(844, { height: 422, offsetTop: 40, scale: 2 })).toEqual({ height: 844, top: 0 })
	})
	it('bounds bad or transitional browser metrics', () => {
		expect(getVisualViewportGeometry(844, { height: 900, offsetTop: -10, scale: 1 })).toEqual({ height: 844, top: 0 })
		expect(getVisualViewportGeometry(844, { height: Number.NaN, offsetTop: 0, scale: 1 })).toEqual({ height: 844, top: 0 })
	})
})
