import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import styles from '../ObjectsSearch.module.css'
import { ObjectsFiltersDrawer } from '../ObjectsFiltersDrawer'

function buildProps() {
	return {
		open: true,
		onClose: vi.fn(),
		isAdvanced: true,
		typeFilter: 'all' as const,
		onTypeFilterChange: vi.fn(),
		favoritesOnly: false,
		onFavoritesOnlyChange: vi.fn(),
		favoritesFirst: false,
		onFavoritesFirstChange: vi.fn(),
		extFilter: '',
		extOptions: [{ label: 'log', value: 'log' }],
		onExtFilterChange: vi.fn(),
		minSizeBytes: null,
		maxSizeBytes: null,
		onMinSizeBytesChange: vi.fn(),
		onMaxSizeBytesChange: vi.fn(),
		modifiedAfterMs: null,
		modifiedBeforeMs: null,
		onModifiedRangeChange: vi.fn(),
		sort: 'name_asc' as const,
		onSortChange: vi.fn(),
		onResetView: vi.fn(),
		hasActiveView: true,
	}
}

describe('ObjectsFiltersDrawer', () => {
	it('renders compact mobile drawer actions', () => {
		render(<ObjectsFiltersDrawer {...buildProps()} />)

		expect(screen.getByTestId('objects-filters-sheet')).toBeInTheDocument()
		expect(screen.getByTestId('objects-filters-content')).toBeInTheDocument()
		expect(screen.getByTestId('objects-filters-actions')).toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Reset view' }).className).toContain(styles.globalSearchCompactButton)
		expect(screen.getByRole('button', { name: 'Done' }).className).toContain(styles.globalSearchCompactButton)
	})
})
