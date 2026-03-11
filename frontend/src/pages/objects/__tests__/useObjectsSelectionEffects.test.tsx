import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useObjectsSelectionEffects } from '../useObjectsSelectionEffects'

function createHarness(args: { prefix?: string; favoritesOpenDetails?: boolean } = {}) {
	const navigateToLocation = vi.fn()
	const rendered = renderHook(() => {
		const [bucket, setBucket] = useState('bucket-a')
		const [prefix, setPrefix] = useState(args.prefix ?? '')
		const [profileId, setProfileId] = useState<string | null>('profile-1')
		const [detailsOpen, setDetailsOpen] = useState(false)
		const [detailsDrawerOpen, setDetailsDrawerOpen] = useState(false)
		const [treeDrawerOpen, setTreeDrawerOpen] = useState(true)
		const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set())
		const [lastSelectedObjectKey, setLastSelectedObjectKey] = useState<string | null>(null)

		const selection = useObjectsSelectionEffects({
			bucket,
			prefix,
			profileId,
			favoritesOpenDetails: args.favoritesOpenDetails ?? false,
			navigateToLocation,
			setDetailsOpen,
			setDetailsDrawerOpen,
			setTreeDrawerOpen,
			setSelectedKeys,
			setLastSelectedObjectKey,
		})

		return {
			...selection,
			bucket,
			setBucket,
			prefix,
			setPrefix,
			profileId,
			setProfileId,
			detailsOpen,
			detailsDrawerOpen,
			treeDrawerOpen,
			selectedKeys,
			lastSelectedObjectKey,
		}
	})

	return { ...rendered, navigateToLocation }
}

describe('useObjectsSelectionEffects', () => {
	it('selects a favorite immediately when it is already in the current prefix', () => {
		const { result, navigateToLocation } = createHarness({ prefix: 'docs/', favoritesOpenDetails: true })

		act(() => {
			result.current.handleFavoriteSelect('docs/report.pdf', true)
		})

		expect(Array.from(result.current.selectedKeys)).toEqual(['docs/report.pdf'])
		expect(result.current.lastSelectedObjectKey).toBe('docs/report.pdf')
		expect(result.current.detailsOpen).toBe(true)
		expect(result.current.detailsDrawerOpen).toBe(true)
		expect(result.current.treeDrawerOpen).toBe(false)
		expect(navigateToLocation).not.toHaveBeenCalled()
	})

	it('restores favorite selection after navigating to a different prefix', () => {
		const { result, navigateToLocation } = createHarness({ prefix: '', favoritesOpenDetails: true })

		act(() => {
			result.current.handleFavoriteSelect('photos/2025/image.jpg', true)
		})

		expect(navigateToLocation).toHaveBeenCalledWith('bucket-a', 'photos/2025/', { recordHistory: true })
		expect(result.current.selectedKeys.size).toBe(0)
		expect(result.current.treeDrawerOpen).toBe(false)

		act(() => {
			result.current.setPrefix('photos/2025/')
		})

		expect(Array.from(result.current.selectedKeys)).toEqual(['photos/2025/image.jpg'])
		expect(result.current.lastSelectedObjectKey).toBe('photos/2025/image.jpg')
		expect(result.current.detailsOpen).toBe(true)
		expect(result.current.detailsDrawerOpen).toBe(true)
	})
})
