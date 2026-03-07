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
					{ kind: 'object', object: { key: 'photos/cat.png', size: 128, lastModified: '2026-03-07T11:00:00Z' } },
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
				renderPrefixGridItem={(prefix) => <div key={prefix}>grid-prefix:{prefix}</div>}
				renderObjectGridItem={(object) => <div key={object.key}>grid-object:{object.key}</div>}
			/>,
		)

		expect(screen.getByTestId('objects-grid-content')).toBeInTheDocument()
		expect(screen.getByText('grid-prefix:photos/')).toBeInTheDocument()
		expect(screen.getByText('grid-object:photos/cat.png')).toBeInTheDocument()
	})
})
