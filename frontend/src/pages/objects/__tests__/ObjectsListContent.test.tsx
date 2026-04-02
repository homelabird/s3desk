import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ObjectsListContent } from '../ObjectsListContent'

describe('ObjectsListContent', () => {
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
				renderObjectRow={vi.fn()}
				renderPrefixGridItem={(prefix) => (
					<div key={prefix}>grid-prefix:{prefix}</div>
				)}
				renderObjectGridItem={(object) => (
					<div key={object.key}>grid-object:{object.key}</div>
				)}
			/>,
		)

		expect(screen.getByTestId('objects-grid-content')).toBeInTheDocument()
		expect(screen.getByText('grid-prefix:photos/')).toBeInTheDocument()
		expect(screen.getByText('grid-object:photos/cat.png')).toBeInTheDocument()
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
				renderObjectRow={renderObjectRow}
				renderPrefixGridItem={vi.fn()}
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
