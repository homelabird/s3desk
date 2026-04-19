import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FullAppOverlaysHostProps } from '../FullAppOverlaysHost'
import type {
	FullAppShellChromeProps,
	FullAppShellChromeSession,
} from '../FullAppShellChrome'
import type { APIClient } from '../api/client'
import { useFullAppController } from '../useFullAppController'
import type { FullAppViewportState } from '../useFullAppViewportState'

type FullAppProfileStateArgs = Parameters<
	typeof import('../useFullAppProfileState').useFullAppProfileState
>[0]
type FullAppProfileStateResult = ReturnType<
	typeof import('../useFullAppProfileState').useFullAppProfileState
>
type FullAppShellStateArgs = Parameters<
	typeof import('../useFullAppShellState').useFullAppShellState
>[0]
type FullAppShellStateResult = ReturnType<
	typeof import('../useFullAppShellState').useFullAppShellState
>
type FullAppShellViewModelArgs = Parameters<
	typeof import('../useFullAppShellViewModel').useFullAppShellViewModel
>[0]
type FullAppShellViewModelResult = ReturnType<
	typeof import('../useFullAppShellViewModel').useFullAppShellViewModel
>
type HookRef = {
	current: unknown | null
}

function readRef<T>(ref: HookRef): T {
	return ref.current as T
}

const {
	profileStateRef,
	shellStateRef,
	shellViewModelRef,
	profileArgsRef,
	shellArgsRef,
	shellViewModelArgsRef,
} = vi.hoisted(
	(): {
		profileStateRef: HookRef
		shellStateRef: HookRef
		shellViewModelRef: HookRef
		profileArgsRef: HookRef
		shellArgsRef: HookRef
		shellViewModelArgsRef: HookRef
	} => ({
		profileStateRef: { current: null },
		shellStateRef: { current: null },
		shellViewModelRef: { current: null },
		profileArgsRef: { current: null },
		shellArgsRef: { current: null },
		shellViewModelArgsRef: { current: null },
	}),
)

vi.mock('../useFullAppProfileState', () => ({
	useFullAppProfileState: (args: FullAppProfileStateArgs) => {
		profileArgsRef.current = args
		return readRef<FullAppProfileStateResult>(profileStateRef)
	},
}))

vi.mock('../useFullAppShellState', () => ({
	useFullAppShellState: (args: FullAppShellStateArgs) => {
		shellArgsRef.current = args
		return readRef<FullAppShellStateResult>(shellStateRef)
	},
}))

vi.mock('../useFullAppShellViewModel', () => ({
	useFullAppShellViewModel: (args: FullAppShellViewModelArgs) => {
		shellViewModelArgsRef.current = args
		return readRef<FullAppShellViewModelResult>(shellViewModelRef)
	},
}))

describe('useFullAppController', () => {
	beforeEach(() => {
		profileStateRef.current = null
		shellStateRef.current = null
		shellViewModelRef.current = null
		profileArgsRef.current = null
		shellArgsRef.current = null
		shellViewModelArgsRef.current = null
	})

	it('composes bootstrap, transfers, routes, and shell view-model state', () => {
		const api = {} as APIClient
		const setApiToken = vi.fn()
		const setProfileId = vi.fn()
		const setGuideOpen = vi.fn()
		const refetch = vi.fn()
		const openNav = vi.fn()
		const closeNav = vi.fn()
		const openSettings = vi.fn()
		const closeSettings = vi.fn()
		const logout = vi.fn()
		const compactHeaderMenu = { items: [{ key: 'settings', label: 'Settings' }] }
		const theme: FullAppShellChromeProps['theme'] = {
			mode: 'light',
			toggleMode: vi.fn(),
		}
		const viewport: FullAppViewportState = {
			hasMediumBreakpoint: true,
			isDesktop: true,
			isStackedHeader: false,
			usesCompactHeader: false,
		}
		const chrome: Pick<FullAppShellChromeProps, 'session' | 'theme' | 'viewport'> =
			{
				session: { marker: 'chrome-session' } as unknown as FullAppShellChromeProps['session'],
				theme,
				viewport,
			}
		const overlays: FullAppOverlaysHostProps = {
			settings: {
				open: true,
				shellScopeKey: 'token-a:profile-1',
				close: closeSettings,
				apiToken: 'token-a',
				setApiToken,
				profileId: 'profile-1',
				setProfileId,
			},
			guide: {
				open: true,
				close: vi.fn(),
			},
		}

		profileStateRef.current = {
			metaQuery: {
				isPending: false,
				isError: false,
				error: null,
				data: { uploadDirectStream: true },
				refetch,
			},
			profilesQuery: {
				isPending: false,
			},
			safeProfileId: 'profile-1',
			setProfileId,
			profileGate: 'profile-gate',
			uploadCapabilityByProfileId: {
				'profile-1': { presignedUpload: true, directUpload: false },
			},
			uploadDirectStream: true,
			shellScopeKey: 'token-a:profile-1',
		}
		shellStateRef.current = {
			selectedKey: '/objects',
			navOpen: true,
			settingsOpen: true,
			guideOpen: true,
			setGuideOpen,
			openNav,
			closeNav,
			openSettings,
			closeSettings,
			logout,
			compactHeaderMenu,
		}
		shellViewModelRef.current = {
			chrome,
			overlays,
		}

		const { result } = renderHook(() =>
			useFullAppController({
				api,
				apiToken: 'token-a',
				setApiToken,
				pathname: '/objects',
				routeLocationKey: 'route-key-1',
				theme,
				viewport,
			}),
		)

		const profileArgs = readRef<FullAppProfileStateArgs>(profileArgsRef)
		const shellArgs = readRef<FullAppShellStateArgs>(shellArgsRef)
		const shellViewModelArgs =
			readRef<FullAppShellViewModelArgs>(shellViewModelArgsRef)

		expect(profileArgs).toEqual({
			api,
			apiToken: 'token-a',
			pathname: '/objects',
		})
		expect(shellArgs.apiToken).toBe('token-a')
		expect(shellArgs.pathname).toBe('/objects')
		expect(shellArgs.shellScopeKey).toBe('token-a:profile-1')

		shellArgs.clearProfileSelection()
		expect(setProfileId).toHaveBeenCalledWith(null)

		expect(shellViewModelArgs).toMatchObject({
			api,
			meta: { uploadDirectStream: true },
			apiToken: 'token-a',
			profileId: 'profile-1',
			setProfileId,
			shellScopeKey: 'token-a:profile-1',
			selectedKey: '/objects',
			navOpen: true,
			openNav,
			closeNav,
			openSettings,
			logout,
			compactHeaderMenu,
			settingsOpen: true,
			closeSettings,
			setApiToken,
			guideOpen: true,
			setGuideOpen,
			theme,
			viewport,
		})

		expect(result.current.bootstrap.metaPending).toBe(false)
		expect(result.current.bootstrap.metaError).toBeNull()
		expect(result.current.bootstrap.apiToken).toBe('token-a')
		expect(result.current.bootstrap.setApiToken).toBe(setApiToken)
		expect(result.current.bootstrap.profileGate).toBe('profile-gate')
		expect(result.current.bootstrap.profilesPending).toBe(false)
		result.current.bootstrap.onRetry()
		expect(refetch).toHaveBeenCalledTimes(1)

		expect(result.current.transfers).toEqual({
			providerKey: 'transfers:token-a',
			apiToken: 'token-a',
			uploadDirectStream: true,
			uploadCapabilityByProfileId: {
				'profile-1': { presignedUpload: true, directUpload: false },
			},
		})

		expect(result.current.routes).toEqual({
			apiToken: 'token-a',
			profileId: 'profile-1',
			setProfileId,
			shellScopeKey: 'token-a:profile-1',
			routeLocationKey: 'route-key-1',
		})

		expect(result.current.chrome).toBe(chrome)
		expect(result.current.overlays).toBe(overlays)
	})

	it('uses the none transfer provider key when the api token is empty', () => {
		const api = {} as APIClient
		const setApiToken = vi.fn()
		const setProfileId = vi.fn()
		const theme: FullAppShellChromeProps['theme'] = {
			mode: 'dark',
			toggleMode: vi.fn(),
		}
		const session: FullAppShellChromeSession = {
			api,
			meta: undefined,
			apiToken: '',
			profileId: null,
			setProfileId,
			shellScopeKey: '__no_server__:__no_profile__',
			selectedKey: '/profiles',
			navOpen: false,
			openNav: vi.fn(),
			closeNav: vi.fn(),
			openSettings: vi.fn(),
			logout: vi.fn(),
			compactHeaderMenu: { items: [] },
		}
		const viewport: FullAppViewportState = {
			hasMediumBreakpoint: false,
			isDesktop: false,
			isStackedHeader: true,
			usesCompactHeader: true,
		}

		profileStateRef.current = {
			metaQuery: {
				isPending: true,
				isError: false,
				error: null,
				data: undefined,
				refetch: vi.fn(),
			},
			profilesQuery: {
				isPending: true,
			},
			safeProfileId: null,
			setProfileId,
			profileGate: null,
			uploadCapabilityByProfileId: {},
			uploadDirectStream: false,
			shellScopeKey: '__no_server__:__no_profile__',
		}
		shellStateRef.current = {
			selectedKey: '/profiles',
			navOpen: false,
			settingsOpen: false,
			guideOpen: false,
			setGuideOpen: vi.fn(),
			openNav: vi.fn(),
			closeNav: vi.fn(),
			openSettings: vi.fn(),
			closeSettings: vi.fn(),
			logout: vi.fn(),
			compactHeaderMenu: { items: [] },
		}
		shellViewModelRef.current = {
			chrome: { session, theme, viewport },
			overlays: {
				settings: {
					open: false,
					shellScopeKey: '__no_server__:__no_profile__',
					close: vi.fn(),
					apiToken: '',
					setApiToken,
					profileId: null,
					setProfileId,
				},
				guide: {
					open: false,
					close: vi.fn(),
				},
			},
		}

		const { result } = renderHook(() =>
			useFullAppController({
				api,
				apiToken: '',
				setApiToken,
				pathname: '/profiles',
				routeLocationKey: 'route-key-empty',
				theme,
				viewport,
			}),
		)

		expect(result.current.transfers.providerKey).toBe('transfers:none')
		expect(result.current.routes.profileId).toBeNull()
		expect(result.current.bootstrap.metaPending).toBe(true)
		expect(result.current.bootstrap.profilesPending).toBe(true)
	})
})
