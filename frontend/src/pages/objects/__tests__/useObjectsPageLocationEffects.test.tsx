import { renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsPageLocationEffects } from '../useObjectsPageLocationEffects'

describe('useObjectsPageLocationEffects', () => {
	it('opens the bucket from transient route state and clears that state', async () => {
		const navigate = vi.fn()
		const navigateToLocation = vi.fn()
		const clearInvalidLocation = vi.fn()

		renderHook(() =>
			useObjectsPageLocationEffects({
				routeLocation: {
					pathname: '/objects',
					search: '?view=list',
					hash: '#focus',
					state: {
						openBucket: true,
						bucket: 'bucket-a',
						prefix: 'docs/reports',
					},
				},
				navigate,
				navigateToLocation,
				profileId: 'profile-1',
				currentBucket: '',
				availableBucketNames: new Set(['bucket-a']),
				bucketsLoaded: true,
				clearInvalidLocation,
			}),
		)

		await waitFor(() =>
			expect(navigateToLocation).toHaveBeenCalledWith(
				'bucket-a',
				'docs/reports',
				{ recordHistory: true },
			),
		)
		expect(navigate).toHaveBeenCalledWith('/objects?view=list#focus', {
			replace: true,
			state: null,
		})
		expect(clearInvalidLocation).not.toHaveBeenCalled()
	})

	it('clears invalid active buckets only after the bucket list has loaded', async () => {
		const navigate = vi.fn()
		const navigateToLocation = vi.fn()
		const clearInvalidLocation = vi.fn()

		const { rerender } = renderHook(
			(props: {
				profileId: string | null
				currentBucket: string
				availableBucketNames: Set<string>
				bucketsLoaded: boolean
			}) =>
				useObjectsPageLocationEffects({
					routeLocation: {
						pathname: '/objects',
						search: '',
						hash: '',
						state: null,
					},
					navigate,
					navigateToLocation,
					clearInvalidLocation,
					...props,
				}),
			{
				initialProps: {
					profileId: 'profile-1',
					currentBucket: 'bucket-missing',
					availableBucketNames: new Set<string>(),
					bucketsLoaded: false,
				},
			},
		)

		expect(clearInvalidLocation).not.toHaveBeenCalled()

		rerender({
			profileId: 'profile-1',
			currentBucket: 'bucket-missing',
			availableBucketNames: new Set(['bucket-a']),
			bucketsLoaded: true,
		})

		await waitFor(() =>
			expect(clearInvalidLocation).toHaveBeenCalledWith('bucket-missing'),
		)
		expect(navigate).not.toHaveBeenCalled()
		expect(navigateToLocation).not.toHaveBeenCalled()
	})
})
