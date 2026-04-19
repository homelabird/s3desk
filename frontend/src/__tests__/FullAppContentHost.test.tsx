import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { FullAppRoutesProps } from '../FullAppRoutes'
import { FullAppContentHost } from '../FullAppContentHost'

const { routesPropsRef } = vi.hoisted(
	(): {
		routesPropsRef: { current: FullAppRoutesProps | null }
	} => ({
		routesPropsRef: { current: null },
	}),
)

vi.mock('antd', () => ({
	Spin: function SpinMock() {
		return <div data-testid="content-host-spinner" />
	},
}))

vi.mock('../components/NetworkStatusBanner', () => ({
	NetworkStatusBanner: function NetworkStatusBannerMock() {
		return <div data-testid="content-host-network-banner" />
	},
}))

vi.mock('../components/JobQueueBanner', () => ({
	JobQueueBanner: function JobQueueBannerMock() {
		return <div data-testid="content-host-job-banner" />
	},
}))

vi.mock('../FullAppRoutes', () => ({
	FullAppRoutes: function FullAppRoutesMock(props: FullAppRoutesProps) {
		routesPropsRef.current = props
		return (
			<div data-testid="content-host-routes">
				<div data-testid="content-host-fallback">{props.loadingFallback}</div>
			</div>
		)
	},
}))

describe('FullAppContentHost', () => {
	beforeEach(() => {
		routesPropsRef.current = null
	})

	it('renders sticky banners and passes route props with a loading fallback', () => {
		const setProfileId = vi.fn()
		const { container } = render(
			<FullAppContentHost
				apiToken="token-a"
				profileId="profile-1"
				setProfileId={setProfileId}
				shellScopeKey="token-a:profile-1"
				routeLocationKey="route-key-1"
			/>,
		)

		const main = container.querySelector('main#main')
		expect(main).toHaveAttribute('data-scroll-container', 'app-content')
		expect(main).toHaveAttribute('tabindex', '-1')

		expect(screen.getByTestId('content-host-network-banner')).toBeInTheDocument()
		expect(screen.getByTestId('content-host-job-banner')).toBeInTheDocument()
		expect(screen.getByTestId('content-host-routes')).toBeInTheDocument()
		expect(screen.getByTestId('content-host-spinner')).toBeInTheDocument()

		expect(routesPropsRef.current).not.toBeNull()
		expect(routesPropsRef.current).toMatchObject({
			apiToken: 'token-a',
			profileId: 'profile-1',
			shellScopeKey: 'token-a:profile-1',
			routeLocationKey: 'route-key-1',
		})
		expect(routesPropsRef.current?.setProfileId).toBe(setProfileId)
	})
})
