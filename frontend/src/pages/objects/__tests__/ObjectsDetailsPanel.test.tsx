import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsDetailsPanel } from '../ObjectsDetailsPanel'

function buildProps(
	overrides: Partial<ComponentProps<typeof ObjectsDetailsPanel>> = {},
): ComponentProps<typeof ObjectsDetailsPanel> {
	return {
		dockDetails: true,
		detailsOpen: true,
		detailsDrawerOpen: false,
		detailsPanelBody: <div>Details body</div>,
		onOpenDetails: vi.fn(),
		onCloseDetails: vi.fn(),
		onCloseDrawer: vi.fn(),
		onResizePointerDown: vi.fn(),
		onResizePointerMove: vi.fn(),
		onResizePointerUp: vi.fn(),
		onResizeKeyDown: vi.fn(),
		resizeMinWidth: 320,
		resizeMaxWidth: 920,
		resizeValue: 480,
		...overrides,
	}
}

describe('ObjectsDetailsPanel', () => {
	it('exposes the docked details resize handle as a keyboard separator', () => {
		const onResizeKeyDown = vi.fn()
		render(<ObjectsDetailsPanel {...buildProps({ onResizeKeyDown, resizeValue: 512 })} />)

		const separator = screen.getByRole('separator', { name: 'Resize details pane' })
		expect(separator).toHaveAttribute('aria-orientation', 'vertical')
		expect(separator).toHaveAttribute('aria-valuemin', '320')
		expect(separator).toHaveAttribute('aria-valuemax', '920')
		expect(separator).toHaveAttribute('aria-valuenow', '512')

		fireEvent.keyDown(separator, { key: 'ArrowLeft' })
		expect(onResizeKeyDown).toHaveBeenCalledTimes(1)
	})

	it('keeps the collapsed details spacer hidden from assistive technology', () => {
		render(<ObjectsDetailsPanel {...buildProps({ detailsOpen: false })} />)

		expect(screen.queryByRole('separator', { name: 'Resize details pane' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Show details' })).toBeInTheDocument()
	})

	it('uses the stable details drawer id when rendered as a sheet', () => {
		render(<ObjectsDetailsPanel {...buildProps({ dockDetails: false, detailsDrawerOpen: true })} />)

		expect(screen.getByRole('dialog', { name: 'Details' })).toHaveAttribute('id', 'objects-details-drawer')
	})
})
