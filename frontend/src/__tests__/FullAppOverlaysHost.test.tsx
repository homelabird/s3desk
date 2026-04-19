import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FullAppOverlaysHost } from '../FullAppOverlaysHost'

vi.mock('../components/SettingsDrawer', () => ({
	SettingsDrawer: function SettingsDrawerMock(props: {
		open: boolean
		onClose: () => void
		apiToken: string
		profileId: string | null
	}) {
		if (!props.open) return null
		return (
			<div data-testid="overlays-host-settings">
				<span>{props.apiToken}</span>
				<span>{props.profileId ?? 'none'}</span>
				<button type="button" onClick={props.onClose}>
					Close settings
				</button>
			</div>
		)
	},
}))

vi.mock('../components/KeyboardShortcutGuide', () => ({
	KeyboardShortcutGuide: function KeyboardShortcutGuideMock(props: {
		open: boolean
		onClose: () => void
	}) {
		if (!props.open) return null
		return (
			<div data-testid="overlays-host-guide">
				<button type="button" onClick={props.onClose}>
					Close guide
				</button>
			</div>
		)
	},
}))

describe('FullAppOverlaysHost', () => {
	it('renders open overlays and wires close handlers', async () => {
		const closeSettings = vi.fn()
		const closeGuide = vi.fn()

		render(
			<FullAppOverlaysHost
				settings={{
					open: true,
					shellScopeKey: 'token-a:profile-1',
					close: closeSettings,
					apiToken: 'token-a',
					setApiToken: vi.fn(),
					profileId: 'profile-1',
					setProfileId: vi.fn(),
				}}
				guide={{
					open: true,
					close: closeGuide,
				}}
			/>,
		)

		expect(await screen.findByTestId('overlays-host-settings')).toHaveTextContent('token-a')
		expect(screen.getByTestId('overlays-host-settings')).toHaveTextContent('profile-1')
		expect(await screen.findByTestId('overlays-host-guide')).toBeInTheDocument()

		fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))
		fireEvent.click(screen.getByRole('button', { name: 'Close guide' }))

		expect(closeSettings).toHaveBeenCalledTimes(1)
		expect(closeGuide).toHaveBeenCalledTimes(1)
	})
})
