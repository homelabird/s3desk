import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { ObjectsListControls } from '../ObjectsListControls'

const originalMatchMedia = window.matchMedia
const originalResizeObserver = globalThis.ResizeObserver

function buildProps(overrides: Partial<React.ComponentProps<typeof ObjectsListControls>> = {}): React.ComponentProps<typeof ObjectsListControls> {
	return {
		bucket: 'media',
		prefix: 'clips/trailer/',
		breadcrumbItems: [{ title: 'media' }, { title: 'clips' }, { title: 'trailer' }],
		isBookmarked: false,
		onToggleBookmark: vi.fn(),
		onOpenPath: vi.fn(),
		isCompact: false,
		searchDraft: '',
		onSearchDraftChange: vi.fn(),
		hasActiveView: false,
		onOpenFilters: vi.fn(),
		isAdvanced: true,
		visiblePrefixCount: 3,
		visibleFileCount: 12,
		search: '',
		hasNextPage: false,
		isFetchingNextPage: false,
		rawTotalCount: 0,
		searchAutoScanCap: 500,
		onOpenGlobalSearch: vi.fn(),
		canInteract: true,
		favoritesOnly: false,
		sort: 'name_asc',
		sortOptions: [
			{ label: 'Name A-Z', value: 'name_asc' },
			{ label: 'Size largest', value: 'size_desc' },
		],
		onSortChange: vi.fn(),
		favoritesFirst: false,
		onFavoritesFirstChange: vi.fn(),
		viewMode: 'list',
		onViewModeChange: vi.fn(),
		...overrides,
	}
}

describe('ObjectsListControls', () => {
	beforeEach(() => {
		window.matchMedia = vi.fn().mockImplementation((query: string) => ({
			matches: false,
			media: query,
			onchange: null,
			addListener: vi.fn(),
			removeListener: vi.fn(),
			addEventListener: vi.fn(),
			removeEventListener: vi.fn(),
			dispatchEvent: vi.fn(),
		}))
		globalThis.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as typeof ResizeObserver
	})

	afterEach(() => {
		window.matchMedia = originalMatchMedia
		globalThis.ResizeObserver = originalResizeObserver
		vi.restoreAllMocks()
	})

	it('renders desktop controls with location, search, sorting and view actions', () => {
		const onFavoritesFirstChange = vi.fn()
		const onViewModeChange = vi.fn()
		const props = buildProps({ onFavoritesFirstChange, onViewModeChange })

		render(<ObjectsListControls {...props} />)

		expect(screen.getByText('s3://media/clips/trailer/')).toBeInTheDocument()
		expect(screen.getByText('3 folders, 12 files')).toBeInTheDocument()

		fireEvent.change(screen.getByLabelText('Search current folder'), { target: { value: 'poster' } })
		expect(props.onSearchDraftChange).toHaveBeenCalledWith('poster')

		fireEvent.click(screen.getByRole('button', { name: 'Add bookmark' }))
		expect(props.onToggleBookmark).toHaveBeenCalledTimes(1)

		fireEvent.click(screen.getByRole('button', { name: 'Go to path' }))
		expect(props.onOpenPath).toHaveBeenCalledTimes(1)

		fireEvent.click(screen.getByRole('button', { name: /View$/ }))
		expect(props.onOpenFilters).toHaveBeenCalledTimes(1)

		fireEvent.change(screen.getByLabelText('Sort objects'), { target: { value: 'size_desc' } })
		expect(props.onSortChange).toHaveBeenCalledWith('size_desc')

		fireEvent.click(screen.getByRole('switch', { name: 'Favorites first' }))
		expect(onFavoritesFirstChange).toHaveBeenCalled()
		expect(onFavoritesFirstChange.mock.calls[0]?.[0]).toBe(true)

		fireEvent.click(screen.getByRole('button', { name: /Grid$/ }))
		expect(onViewModeChange).toHaveBeenCalledWith('grid')
	})

	it('shows capped search guidance and routes users to indexed search', () => {
		const props = buildProps({
			isAdvanced: false,
			search: 'clip',
			hasNextPage: true,
			rawTotalCount: 600,
			searchAutoScanCap: 500,
		})

		render(<ObjectsListControls {...props} />)

		expect(screen.getByText('Search paused at 500 items')).toBeInTheDocument()
		expect(screen.getByText('Use Global Search (Indexed) to scan the full bucket.')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Global Search (Indexed)' }))
		expect(props.onOpenGlobalSearch).toHaveBeenCalledTimes(1)
	})
})
