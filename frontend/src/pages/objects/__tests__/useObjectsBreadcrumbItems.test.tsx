import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsBreadcrumbItems } from '../useObjectsBreadcrumbItems'

function BreadcrumbHarness({ prefix, isMd = false, navigate = vi.fn() }: {
	prefix: string
	isMd?: boolean
	navigate?: ReturnType<typeof vi.fn>
}) {
	const { breadcrumbItems } = useObjectsBreadcrumbItems({
		scopeKey: 'test', bucket: 'bucket', prefix, isMd,
		canDragDrop: false, dndHoverPrefix: null,
		normalizeDropTargetPrefix: (value) => value,
		onDndTargetDragOver: vi.fn(), onDndTargetDragLeave: vi.fn(), onDndTargetDrop: vi.fn(),
		navigateToLocation: navigate,
	})
	return <nav>{breadcrumbItems.map((item, index) => <span key={index}>{item.title}</span>)}</nav>
}

describe('useObjectsBreadcrumbItems', () => {
	it.each([
		{ prefix: '', isMd: false, currentName: '(root)' },
		{ prefix: 'team/reports/deep-folder/', isMd: false, currentName: 'deep-folder/' },
		{ prefix: 'team/reports/deep-folder/', isMd: true, currentName: 'deep-folder/' },
	])('identifies the current location for $prefix at isMd=$isMd', ({ prefix, isMd, currentName }) => {
		render(<BreadcrumbHarness prefix={prefix} isMd={isMd} />)
		const current = screen.getByRole('button', { name: currentName })
		expect(current).toHaveAttribute('aria-current', 'location')
		expect(current).toHaveAttribute('title', currentName)
		expect(document.querySelectorAll('[aria-current="location"]')).toHaveLength(1)
	})

	it('names the collapsed ancestors and retains parent navigation', () => {
		const navigate = vi.fn()
		render(<BreadcrumbHarness prefix="team/reports/deep-folder/" navigate={navigate} />)
		fireEvent.click(screen.getByRole('button', { name: 'Parent folders' }))
		fireEvent.click(screen.getByRole('menuitem', { name: 'reports/' }))
		expect(navigate).toHaveBeenCalledWith('bucket', 'team/reports/', { recordHistory: true })
	})
})
