import { act, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useObjectsPageViewState } from '../useObjectsPageViewState'

function buildAutoScanKey(apiToken: string, profileId: string | null, bucket: string, prefix: string) {
	return `${apiToken || '__no_server__'}:${profileId?.trim() || '__no_profile__'}:${bucket}|${prefix}`
}

describe('useObjectsPageViewState', () => {
	afterEach(() => {
		window.localStorage.clear()
	})

	it('resets auto-scan readiness when the profile changes for the same bucket and prefix', () => {
		const { result, rerender } = renderHook(
			({ profileId }: { profileId: string | null }) =>
				useObjectsPageViewState({
					apiToken: 'token-a',
					profileId,
					bucket: 'bucket-a',
					prefix: 'docs/',
					isOffline: false,
					screens: {},
					openPathModal: vi.fn(),
					setTreeDrawerOpen: vi.fn(),
				}),
			{ initialProps: { profileId: 'profile-1' } },
		)

		act(() => {
			result.current.setAutoScanReadyKey(buildAutoScanKey('token-a', 'profile-1', 'bucket-a', 'docs/'))
		})

		expect(result.current.autoScanReady).toBe(true)

		rerender({ profileId: 'profile-2' })

		expect(result.current.autoScanReady).toBe(false)

		act(() => {
			result.current.setAutoScanReadyKey(buildAutoScanKey('token-a', 'profile-2', 'bucket-a', 'docs/'))
		})

		expect(result.current.autoScanReady).toBe(true)
	})

	it('resets auto-scan readiness when the api token changes for the same profile and bucket', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsPageViewState({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					isOffline: false,
					screens: {},
					openPathModal: vi.fn(),
					setTreeDrawerOpen: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setAutoScanReadyKey(buildAutoScanKey('token-a', 'profile-1', 'bucket-a', 'docs/'))
		})

		expect(result.current.autoScanReady).toBe(true)

		rerender({ apiToken: 'token-b' })

		expect(result.current.autoScanReady).toBe(false)

		act(() => {
			result.current.setAutoScanReadyKey(buildAutoScanKey('token-b', 'profile-1', 'bucket-a', 'docs/'))
		})

		expect(result.current.autoScanReady).toBe(true)
	})

	it('hides the global search overlay when the api token changes for the same profile and bucket', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsPageViewState({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					isOffline: false,
					screens: {},
					openPathModal: vi.fn(),
					setTreeDrawerOpen: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.openGlobalSearch()
		})

		expect(result.current.globalSearchOpen).toBe(true)

		rerender({ apiToken: 'token-b' })

		expect(result.current.globalSearchOpen).toBe(false)
	})

	it('hides transient drawers when the api token changes for the same profile', () => {
		const { result, rerender } = renderHook(
			({ apiToken }: { apiToken: string }) =>
				useObjectsPageViewState({
					apiToken,
					profileId: 'profile-1',
					bucket: 'bucket-a',
					prefix: 'docs/',
					isOffline: false,
					screens: {},
					openPathModal: vi.fn(),
					setTreeDrawerOpen: vi.fn(),
				}),
			{ initialProps: { apiToken: 'token-a' } },
		)

		act(() => {
			result.current.setFiltersDrawerOpen(true)
			result.current.setDetailsDrawerOpen(true)
		})

		expect(result.current.filtersDrawerOpen).toBe(true)
		expect(result.current.detailsDrawerOpen).toBe(true)

		rerender({ apiToken: 'token-b' })

		expect(result.current.filtersDrawerOpen).toBe(false)
		expect(result.current.detailsDrawerOpen).toBe(false)
	})

	it('treats lg screens as desktop for object interactions', () => {
		const { result } = renderHook(() =>
			useObjectsPageViewState({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				isOffline: false,
				screens: { lg: true },
				openPathModal: vi.fn(),
				setTreeDrawerOpen: vi.fn(),
			}),
		)

		expect(result.current.isDesktop).toBe(true)
		expect(result.current.canDragDrop).toBe(true)
	})

	it('treats xl screens as wide desktop for details docking', () => {
		window.localStorage.setItem('objectsUIMode', JSON.stringify('advanced'))

		const { result } = renderHook(() =>
			useObjectsPageViewState({
				apiToken: 'token-a',
				profileId: 'profile-1',
				bucket: 'bucket-a',
				prefix: 'docs/',
				isOffline: false,
				screens: { lg: true, xl: true },
				openPathModal: vi.fn(),
				setTreeDrawerOpen: vi.fn(),
			}),
		)

		expect(result.current.isDesktop).toBe(true)
		expect(result.current.dockDetails).toBe(true)
	})
})
