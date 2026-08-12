import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { describe, expect, it, vi } from 'vitest'

import {
	clearFavoritesFilterHint,
	chooseProfileToShowPinnedObjectsHint,
	failedToLoadFavoritesTitle,
	fetchingPinnedObjectsHint,
	favoritesUnavailableUntilBucketSelectedLabel,
	favoritesUnavailableUntilProfileSelectedLabel,
	loadingFavoritesCountLabel,
	loadingFavoritesTitle,
	noFavoritesMatchQueryTitle,
	noFavoritesYetTitle,
	pickBucketToShowPinnedObjectsHint,
	selectBucketFirstHint,
	selectProfileFirstHint,
	starObjectsToKeepThemHereHint,
} from '../../../lib/actionHints'
import { ObjectsFavoritesPane } from '../ObjectsFavoritesPane'

function buildProps(
	overrides: Partial<ComponentProps<typeof ObjectsFavoritesPane>> = {},
): ComponentProps<typeof ObjectsFavoritesPane> {
	return {
		hasProfile: true,
		hasBucket: true,
		favoriteCount: 0,
		isLoading: false,
		errorMessage: null,
		favorites: [],
		favoritesOnly: false,
		onFavoritesOnlyChange: vi.fn(),
		query: '',
		onQueryChange: vi.fn(),
		onSelectFavorite: vi.fn(),
		expanded: true,
		onExpandedChange: vi.fn(),
		...overrides,
	}
}

describe('ObjectsFavoritesPane', () => {
	it('windows large favorite collections', () => {
		const favorites = Array.from({ length: 1_000 }, (_, index) => ({
			key: `archive/${String(index).padStart(4, '0')}/report.json`,
			size: index,
			lastModified: '2026-03-09T00:00:00Z',
			createdAt: '2026-03-09T00:00:00Z',
		}))

		render(
			<ObjectsFavoritesPane
				{...buildProps({ favoriteCount: favorites.length, favorites })}
			/>,
		)

		expect(screen.getAllByTestId('objects-favorite-item')).toHaveLength(20)
		expect(screen.getByTitle('archive/0000/report.json')).toBeInTheDocument()
		expect(screen.queryByTitle('archive/0999/report.json')).not.toBeInTheDocument()
	})

	it('shows shared prerequisite copy before a profile or bucket is selected', () => {
		const { rerender } = render(<ObjectsFavoritesPane {...buildProps({ hasProfile: false })} />)

		let status = screen.getByTestId('objects-favorites-status')
		let badge = screen.getByTestId('objects-favorites-badge')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'prereq')
		expect(status).toHaveTextContent(selectProfileFirstHint())
		expect(status).toHaveTextContent(chooseProfileToShowPinnedObjectsHint())
		expect(badge).toHaveAttribute('aria-label', favoritesUnavailableUntilProfileSelectedLabel())

		rerender(<ObjectsFavoritesPane {...buildProps({ hasBucket: false })} />)

		status = screen.getByTestId('objects-favorites-status')
		badge = screen.getByTestId('objects-favorites-badge')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'prereq')
		expect(status).toHaveTextContent(selectBucketFirstHint())
		expect(status).toHaveTextContent(pickBucketToShowPinnedObjectsHint())
		expect(badge).toHaveAttribute('aria-label', favoritesUnavailableUntilBucketSelectedLabel())
	})

	it('renders a compact loading status while favorites are hydrating', () => {
		render(<ObjectsFavoritesPane {...buildProps({ isLoading: true })} />)

		const status = screen.getByTestId('objects-favorites-status')
		const badge = screen.getByTestId('objects-favorites-badge')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'loading')
		expect(status).toHaveTextContent(loadingFavoritesTitle())
		expect(status).toHaveTextContent(fetchingPinnedObjectsHint())
		expect(badge).toHaveAttribute('aria-label', loadingFavoritesCountLabel())
		expect(badge).toHaveTextContent('…')
	})

	it('renders a compact empty status with the pinned-object hint', () => {
		render(<ObjectsFavoritesPane {...buildProps()} />)

		const status = screen.getByTestId('objects-favorites-status')
		const badge = screen.getByTestId('objects-favorites-badge')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'empty')
		expect(status).toHaveTextContent(noFavoritesYetTitle())
		expect(status).toHaveTextContent(starObjectsToKeepThemHereHint())
		expect(badge).toHaveAttribute('aria-label', '0 favorites pinned')
	})

	it('renders an alert status when favorites loading fails', () => {
		render(<ObjectsFavoritesPane {...buildProps({ errorMessage: 'favorite hydration failed' })} />)

		const status = screen.getByTestId('objects-favorites-status')
		const badge = screen.getByTestId('objects-favorites-badge')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'error')
		expect(status).toHaveAttribute('role', 'alert')
		expect(status).toHaveTextContent(failedToLoadFavoritesTitle())
		expect(status).toHaveTextContent('favorite hydration failed')
		expect(badge).toHaveAttribute('aria-label', failedToLoadFavoritesTitle())
		expect(badge).toHaveTextContent('!')
	})

	it('announces the pinned favorite count in the header badge', () => {
		render(
			<ObjectsFavoritesPane
				{...buildProps({
					favoriteCount: 2,
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 12,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
						{
							key: 'docs/notes.txt',
							size: 16,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
				})}
			/>,
		)

		const badge = screen.getByTestId('objects-favorites-badge')
		expect(badge).toHaveAttribute('aria-label', '2 favorites pinned')
		expect(badge).toHaveTextContent('2')
	})

	it('renders a shorter filtered-empty message when the search yields no matches', () => {
		render(
			<ObjectsFavoritesPane
				{...buildProps({
					favoriteCount: 1,
					query: 'report',
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 12,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
				})}
			/>,
		)

		const status = screen.getByTestId('objects-favorites-status')
		expect(status).toHaveAttribute('data-favorites-status-kind', 'empty')
		expect(status).toHaveTextContent(noFavoritesMatchQueryTitle('report'))
		expect(status).toHaveTextContent(clearFavoritesFilterHint())
	})

	it('shows the active filter summary in the collapsed header', () => {
		render(
			<ObjectsFavoritesPane
				{...buildProps({
					expanded: false,
					favoritesOnly: true,
					query: 'report',
				})}
			/>,
		)

		const summary = screen.getByTestId('objects-favorites-summary')
		expect(summary).toHaveTextContent('Only · "report"')
		expect(summary).toHaveAttribute('title', 'Only · "report"')
		expect(screen.queryByTestId('objects-favorites-status')).not.toBeInTheDocument()
		expect(screen.getByTestId('objects-favorites-live-status')).toHaveTextContent('0 favorites pinned')
	})

	it('keeps collapsed favorites status updates available to assistive technology', () => {
		const { rerender } = render(<ObjectsFavoritesPane {...buildProps({ expanded: false, isLoading: true })} />)

		let liveStatus = screen.getByTestId('objects-favorites-live-status')
		expect(screen.queryByTestId('objects-favorites-status')).not.toBeInTheDocument()
		expect(liveStatus).toHaveAttribute('role', 'status')
		expect(liveStatus).toHaveTextContent(loadingFavoritesTitle())
		expect(liveStatus).toHaveTextContent(fetchingPinnedObjectsHint())

		rerender(
			<ObjectsFavoritesPane
				{...buildProps({
					expanded: false,
					errorMessage: 'favorite hydration failed',
				})}
			/>,
		)

		liveStatus = screen.getByTestId('objects-favorites-live-status')
		expect(liveStatus).toHaveAttribute('role', 'alert')
		expect(liveStatus).toHaveTextContent(failedToLoadFavoritesTitle())
		expect(liveStatus).toHaveTextContent('favorite hydration failed')

		rerender(
			<ObjectsFavoritesPane
				{...buildProps({
					expanded: false,
					favoriteCount: 2,
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 12,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
						{
							key: 'docs/notes.txt',
							size: 16,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
				})}
			/>,
		)

		liveStatus = screen.getByTestId('objects-favorites-live-status')
		expect(liveStatus).toHaveAttribute('role', 'status')
		expect(liveStatus).toHaveTextContent('2 favorites pinned')
	})

	it('hides the collapsed summary while the pane is expanded', () => {
		render(
			<ObjectsFavoritesPane
				{...buildProps({
					expanded: true,
					favoritesOnly: true,
					query: 'report',
				})}
			/>,
		)

		expect(screen.queryByTestId('objects-favorites-summary')).not.toBeInTheDocument()
	})

	it('keeps favorites behavior controls hidden until the favorites-only filter is active', () => {
		const { rerender } = render(
			<ObjectsFavoritesPane
				{...buildProps({
					favoriteCount: 1,
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 12,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
				})}
			/>,
		)

		expect(screen.queryByTestId('objects-favorites-controls')).not.toBeInTheDocument()

		rerender(
			<ObjectsFavoritesPane
				{...buildProps({
					favoritesOnly: true,
					favoriteCount: 1,
					favorites: [
						{
							key: 'docs/readme.txt',
							size: 12,
							lastModified: '2026-03-09T00:00:00Z',
							createdAt: '2026-03-09T00:00:00Z',
						},
					],
				})}
			/>,
		)

		expect(screen.getByTestId('objects-favorites-controls')).toBeInTheDocument()
		expect(screen.getByText('Favorites only')).toBeInTheDocument()
		expect(screen.queryByText('Open details on click')).not.toBeInTheDocument()
	})
})
