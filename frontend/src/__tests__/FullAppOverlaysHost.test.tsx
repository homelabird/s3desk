import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { FullAppOverlaysHost } from '../FullAppOverlaysHost'

vi.mock('../components/SettingsDrawer', () => ({
	SettingsDrawer: function SettingsDrawerMock(props: {
		open: boolean
		onClose: () => void
		apiToken: string
		profileId: string | null
		profileName: string | null
	}) {
		if (!props.open) return null
		return (
			<div data-testid="overlays-host-settings">
				<span>{props.apiToken}</span>
				<span>{props.profileId ?? 'none'}</span>
				<span>{props.profileName ?? 'none'}</span>
				<button type="button" onClick={props.onClose}>
					Close settings
				</button>
			</div>
		)
	},
}))

describe('FullAppOverlaysHost', () => {
	it('renders settings and wires its close handler', async () => {
		const closeSettings = vi.fn()

		render(
			<FullAppOverlaysHost
				settings={{
					open: true,
					shellScopeKey: 'token-a:profile-1',
					api: {} as never,
					close: closeSettings,
					apiToken: 'token-a',
					setApiToken: vi.fn(),
					profileId: 'profile-1',
					profileName: 'Profile One',
				}}
			/>,
		)

		expect(await screen.findByTestId('overlays-host-settings')).toHaveTextContent('token-a')
		expect(screen.getByTestId('overlays-host-settings')).toHaveTextContent('profile-1')
		expect(screen.getByTestId('overlays-host-settings')).toHaveTextContent('Profile One')
		fireEvent.click(screen.getByRole('button', { name: 'Close settings' }))

		expect(closeSettings).toHaveBeenCalledTimes(1)
	})
})
