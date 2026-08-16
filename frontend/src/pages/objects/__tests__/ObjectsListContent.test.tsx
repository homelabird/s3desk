import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
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
})
