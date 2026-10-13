import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsListContent } from '../ObjectsListContent'

describe('ObjectsListContent', () => {
	it('announces object loading status for an empty fetching list', () => {
		render(
			<ObjectsListContent
				rows={[]}
				virtualItems={[]}
				totalSize={0}
				hasProfile
				hasBucket
				isFetching
				isFetchingNextPage={false}
				emptyKind={null}
				canClearSearch={false}
				onClearSearch={vi.fn()}
				hasActiveFilters={false}
				onResetView={vi.fn()}
				viewMode="list"
				renderPrefixRow={vi.fn()}
				renderParentRow={vi.fn()}
				renderObjectRow={vi.fn()}
				renderPrefixGridItem={vi.fn()}
				renderParentGridItem={vi.fn()}
				renderObjectGridItem={vi.fn()}
			/>,
		)

		expect(screen.getByRole('status', { name: 'Loading objects' })).toHaveTextContent('Loading objects...')
	})

	it('renders rows as cards in grid mode', () => {
		render(
			<ObjectsListContent
				rows={[
					{ kind: 'prefix', prefix: 'photos/' },
					{
						kind: 'object',
						object: {
							key: 'photos/cat.png',
							size: 128,
							lastModified: '2026-03-07T11:00:00Z',
						},
					},
				]}
				virtualItems={[]}
				totalSize={0}
				hasProfile
				hasBucket
				isFetching={false}
				isFetchingNextPage={false}
				emptyKind={null}
				canClearSearch={false}
				onClearSearch={vi.fn()}
				hasActiveFilters={false}
				onResetView={vi.fn()}
				viewMode="grid"
				renderPrefixRow={vi.fn()}
				renderParentRow={vi.fn()}
				renderObjectRow={vi.fn()}
				renderPrefixGridItem={(prefix) => (
					<div key={prefix}>grid-prefix:{prefix}</div>
				)}
				renderParentGridItem={(prefix) => <div key={`parent:${prefix}`}>grid-parent:{prefix || '/'}</div>}
				renderObjectGridItem={(object) => (
					<div key={object.key}>grid-object:{object.key}</div>
				)}
			/>,
		)

		expect(screen.getByTestId('objects-grid-content')).toBeInTheDocument()
		expect(screen.getByRole('list', { name: 'Objects card list' })).toBeInTheDocument()
		expect(screen.getByText('grid-prefix:photos/')).toBeInTheDocument()
		expect(screen.getByText('grid-object:photos/cat.png')).toBeInTheDocument()
	})

	it('windows large object grids', () => {
		const rows = Array.from({ length: 200 }, (_, index) => ({
			kind: 'object' as const,
			object: {
				key: `object-${index}`,
				size: index,
				lastModified: '2026-03-07T11:00:00Z',
			},
		}))

		render(
			<ObjectsListContent
				rows={rows}
				virtualItems={[]}
				totalSize={0}
				hasProfile
				hasBucket
				isFetching={false}
				isFetchingNextPage={false}
				emptyKind={null}
				canClearSearch={false}
				onClearSearch={vi.fn()}
				hasActiveFilters={false}
				onResetView={vi.fn()}
				viewMode="grid"
				renderPrefixRow={vi.fn()}
				renderParentRow={vi.fn()}
				renderObjectRow={vi.fn()}
				renderPrefixGridItem={vi.fn()}
				renderParentGridItem={vi.fn()}
				renderObjectGridItem={(object) => (
					<div key={object.key}>{object.key}</div>
				)}
			/>,
		)

		expect(screen.getByText('object-0')).toBeInTheDocument()
		expect(screen.queryByText('object-199')).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-grid-content').querySelectorAll('[data-index]')).toHaveLength(4)
	})

	it('passes virtual row indexes through to list renderers', () => {
		const renderPrefixRow = vi.fn(
			(prefix: string, offset: number, rowIndex: number) => (
				<div
					key={`${prefix}:${rowIndex}`}
				>{`prefix:${prefix}:${offset}:${rowIndex}`}</div>
			),
		)
		const renderObjectRow = vi.fn(
			(object: { key: string }, offset: number, rowIndex: number) => (
				<div
					key={`${object.key}:${rowIndex}`}
				>{`object:${object.key}:${offset}:${rowIndex}`}</div>
			),
		)

		render(
			<ObjectsListContent
				rows={[
					{ kind: 'prefix', prefix: 'photos/' },
					{
						kind: 'object',
						object: {
							key: 'photos/cat.png',
							size: 128,
							lastModified: '2026-03-07T11:00:00Z',
						},
					},
				]}
				virtualItems={[
					{ index: 0, start: 0 },
					{ index: 1, start: 72 },
				]}
				totalSize={144}
				hasProfile
				hasBucket
				isFetching={false}
				isFetchingNextPage={false}
				emptyKind={null}
				canClearSearch={false}
				onClearSearch={vi.fn()}
				hasActiveFilters={false}
				onResetView={vi.fn()}
				viewMode="list"
				renderPrefixRow={renderPrefixRow}
				renderParentRow={vi.fn()}
				renderObjectRow={renderObjectRow}
				renderPrefixGridItem={vi.fn()}
				renderParentGridItem={vi.fn()}
				renderObjectGridItem={vi.fn()}
			/>,
		)

		expect(renderPrefixRow).toHaveBeenCalledWith('photos/', 0, 0)
		expect(renderObjectRow).toHaveBeenCalledWith(
			expect.objectContaining({ key: 'photos/cat.png' }),
			72,
			1,
		)
		expect(screen.getByText('prefix:photos/:0:0')).toBeInTheDocument()
		expect(screen.getByText('object:photos/cat.png:72:1')).toBeInTheDocument()
	})

	it('offers an enabled reset for filter-only empty results without a disabled search action', () => {
		const props = buildEmptyProps({ hasActiveFilters: true })
		render(<ObjectsListContent {...props} />)

		expect(screen.getByText('No results')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Reset view' })).toBeEnabled()
		fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
		expect(props.onResetView).toHaveBeenCalledOnce()
		expect(props.onClearSearch).not.toHaveBeenCalled()
	})

	it('keeps filter recovery available after clearing a combined search and filter', () => {
		const props = buildEmptyProps({ hasActiveFilters: true, canClearSearch: true })
		const { rerender } = render(<ObjectsListContent {...props} />)

		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
		expect(props.onClearSearch).toHaveBeenCalledOnce()
		expect(props.onResetView).not.toHaveBeenCalled()
		rerender(<ObjectsListContent {...props} canClearSearch={false} />)
		expect(screen.queryByRole('button', { name: 'Clear search' })).not.toBeInTheDocument()
		expect(screen.getByRole('button', { name: 'Reset view' })).toBeEnabled()
		fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
		expect(props.onResetView).toHaveBeenCalledOnce()

		rerender(<ObjectsListContent {...props} hasActiveFilters={false} canClearSearch={false} emptyKind="empty" />)
		expect(screen.getByText('Empty folder')).toBeInTheDocument()
		expect(screen.queryByRole('button', { name: 'Reset view' })).not.toBeInTheDocument()
	})

	it.each(['list', 'grid'] as const)('preserves parent navigation above empty search and filter recovery in %s mode', (viewMode) => {
		const props = buildEmptyProps({
			rows: [{ kind: 'parent', prefix: '' }],
			virtualItems: [{ index: 0, start: 0 }],
			totalSize: 64,
			viewMode,
			hasActiveFilters: true,
			canClearSearch: true,
			renderParentRow: () => <button key="parent">Up to bucket</button>,
			renderParentGridItem: () => <button key="parent">Up to bucket</button>,
			showLoadMore: true,
			onLoadMore: vi.fn(),
		})
		render(<ObjectsListContent {...props} />)

		const parent = screen.getByRole('button', { name: 'Up to bucket' })
		const empty = screen.getByText('No results')
		expect(parent).toBeInTheDocument()
		expect(parent.compareDocumentPosition(empty) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
		fireEvent.click(screen.getByRole('button', { name: 'Clear search' }))
		fireEvent.click(screen.getByRole('button', { name: 'Reset view' }))
		expect(props.onClearSearch).toHaveBeenCalledOnce()
		expect(props.onResetView).toHaveBeenCalledOnce()
		expect(screen.getAllByRole('button', { name: 'Load more' })).toHaveLength(1)
	})
})

function buildEmptyProps(overrides: Partial<ComponentProps<typeof ObjectsListContent>> = {}): ComponentProps<typeof ObjectsListContent> {
	return {
		rows: [], virtualItems: [], totalSize: 0,
		hasProfile: true, hasBucket: true,
		isFetching: false, isFetchingNextPage: false,
		emptyKind: 'noresults', canClearSearch: false, onClearSearch: vi.fn(),
		hasActiveFilters: false, onResetView: vi.fn(), viewMode: 'list',
		renderPrefixRow: vi.fn(), renderParentRow: vi.fn(), renderObjectRow: vi.fn(),
		renderPrefixGridItem: vi.fn(), renderParentGridItem: vi.fn(), renderObjectGridItem: vi.fn(),
		...overrides,
	}
}
