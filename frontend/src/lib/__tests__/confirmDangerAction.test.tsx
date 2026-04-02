import { afterEach, describe, expect, it, vi } from 'vitest'

const { capturedProps } = vi.hoisted(() => ({
	capturedProps: { current: null as null | Record<string, unknown> },
}))

vi.mock('../../components/imperativeDialog', () => ({
	mountImperativeDialog: (render: (close: () => void) => unknown) => {
		const element = render(() => undefined) as { props?: Record<string, unknown> } | null
		capturedProps.current = element?.props ?? null
	},
}))

import { confirmDangerAction } from '../confirmDangerAction'

describe('confirmDangerAction', () => {
	afterEach(() => {
		capturedProps.current = null
		window.localStorage.clear()
		window.sessionStorage.clear()
	})

	it('captures the current api token scope when opening a confirmation dialog', () => {
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))

		confirmDangerAction({
			title: 'Delete bucket',
			onConfirm: () => undefined,
		})

		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))

		expect(capturedProps.current?.scopeApiToken).toBe('token-a')
	})
})
