import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PopoverSurface } from '../PopoverSurface'

function createRect({ top, left, width, height }: { top: number; left: number; width: number; height: number }): DOMRect {
	return {
		x: left,
		y: top,
		top,
		left,
		width,
		height,
		right: left + width,
		bottom: top + height,
		toJSON: () => ({}),
	} as DOMRect
}

function mockSafeAreaInsets({ top = 0, right = 0, bottom = 0, left = 0 }: Partial<Record<'top' | 'right' | 'bottom' | 'left', number>>) {
	const realGetComputedStyle = window.getComputedStyle.bind(window)
	vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
		if (element instanceof HTMLElement && element.dataset.popoverSafeAreaProbe === 'true') {
			const style = realGetComputedStyle(element, pseudoElement)
			return Object.assign(Object.create(style), {
				paddingTop: `${top}px`,
				paddingRight: `${right}px`,
				paddingBottom: `${bottom}px`,
				paddingLeft: `${left}px`,
			}) as CSSStyleDeclaration
		}
		return realGetComputedStyle(element, pseudoElement)
	})
}

afterEach(() => {
	vi.restoreAllMocks()
	document.querySelector('[data-popover-safe-area-probe="true"]')?.remove()
})

describe('PopoverSurface', () => {
	it('clamps the panel within a custom viewport rect and publishes panel size budget variables', async () => {
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'viewport':
					return createRect({ top: 100, left: 20, width: 740, height: 240 })
				case 'anchor':
					return createRect({ top: 0, left: 25, width: 32, height: 25 })
				case 'panel':
					return createRect({ top: 0, left: 0, width: 202, height: 344 })
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<div data-testid="viewport">
				<PopoverSurface
					open
					rootProps={{ 'data-testid': 'anchor' }}
					contentProps={{ 'data-testid': 'panel' }}
					getViewportRect={(anchorElement) => {
						const viewportElement = anchorElement.closest('[data-testid="viewport"]')
						return viewportElement instanceof HTMLElement ? viewportElement.getBoundingClientRect() : null
					}}
					content={() => <div>Menu</div>}
				>
					{() => <button type="button">Open</button>}
				</PopoverSurface>
			</div>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			expect(panel.style.visibility).toBe('visible')
			expect(panel.style.top).toBe('116px')
			expect(panel.style.left).toBe('36px')
		})
		expect(panel.style.getPropertyValue('--popover-available-height')).toBe('208px')
		expect(panel.style.getPropertyValue('--popover-available-width')).toBe('708px')
	})

	it('publishes window viewport popover size budgets from the safe-area-aware clamp box', async () => {
		vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
		vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'anchor':
					return createRect({ top: 20, left: 20, width: 32, height: 24 })
				case 'panel':
					return createRect({ top: 0, left: 0, width: 202, height: 120 })
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<PopoverSurface open rootProps={{ 'data-testid': 'anchor' }} contentProps={{ 'data-testid': 'panel' }} content={() => <div>Menu</div>}>
				{() => <button type="button">Open</button>}
			</PopoverSurface>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			expect(panel.style.visibility).toBe('visible')
			expect(panel.style.top).toBe('52px')
			expect(panel.style.left).toBe('20px')
		})
		expect(panel.style.getPropertyValue('--popover-available-height')).toBe('812px')
		expect(panel.style.getPropertyValue('--popover-available-width')).toBe('358px')
	})

	it('keeps end-aligned window viewport popovers inside safe-area insets during positioning', async () => {
		vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(844)
		vi.spyOn(window, 'innerHeight', 'get').mockReturnValue(390)
		mockSafeAreaInsets({ right: 44, left: 44 })
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
			switch (this.getAttribute('data-testid')) {
				case 'anchor':
					return createRect({ top: 20, left: 780, width: 48, height: 24 })
				case 'panel':
					return createRect({ top: 0, left: 0, width: 202, height: 120 })
				default:
					return createRect({ top: 0, left: 0, width: 0, height: 0 })
			}
		})

		render(
			<PopoverSurface
				align="end"
				open
				rootProps={{ 'data-testid': 'anchor' }}
				contentProps={{ 'data-testid': 'panel' }}
				content={() => <div>Menu</div>}
			>
				{() => <button type="button">Open</button>}
			</PopoverSurface>,
		)

		const panel = screen.getByTestId('panel')
		await waitFor(() => {
			expect(panel.style.visibility).toBe('visible')
			expect(panel.style.top).toBe('52px')
			expect(panel.style.left).toBe('582px')
		})
		expect(panel.style.getPropertyValue('--popover-available-height')).toBe('358px')
		expect(panel.style.getPropertyValue('--popover-available-width')).toBe('724px')
	})
})
