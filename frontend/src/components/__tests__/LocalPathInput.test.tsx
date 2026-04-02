import { act, fireEvent, render, screen } from '@testing-library/react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMockApiClient } from '../../test/mockApiClient'
import { LocalPathInput } from '../LocalPathInput'

vi.mock('antd', async () => {
	type MockButtonProps = {
		children?: ReactNode
	} & Pick<ButtonHTMLAttributes<HTMLButtonElement>, 'disabled' | 'onClick'>
	type MockInputProps = {
		addonAfter?: ReactNode
		suffix?: ReactNode
	} & Pick<
		InputHTMLAttributes<HTMLInputElement>,
		'disabled' | 'list' | 'onChange' | 'onFocus' | 'placeholder' | 'value'
	>
	return {
		Button: ({ children, onClick, disabled }: MockButtonProps) => (
			<button type="button" onClick={onClick} disabled={disabled}>
				{children}
			</button>
		),
		Input: ({ addonAfter, suffix, ...props }: MockInputProps) => (
			<div>
				<input {...props} />
				{suffix}
				{addonAfter}
			</div>
		),
	}
})

vi.mock('@ant-design/icons', () => ({
	LoadingOutlined: () => <span>loading</span>,
}))

function deferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((res, rej) => {
		resolve = res
		reject = rej
	})
	return { promise, resolve, reject }
}

describe('LocalPathInput', () => {
	afterEach(() => {
		vi.useRealTimers()
	})

	it('ignores stale suggestions after the profile changes', async () => {
		vi.useFakeTimers()
		const firstRequest = deferred<{ entries: Array<{ path: string; name: string }> }>()
		const listLocalEntries = vi
			.fn()
			.mockImplementationOnce(() => firstRequest.promise)
			.mockResolvedValueOnce({ entries: [] })
		const api = createMockApiClient({
			objects: { listLocalEntries },
		})

		const { rerender, container } = render(
			<LocalPathInput api={api} profileId="profile-1" value="" onChange={() => {}} />,
		)

		fireEvent.focus(screen.getByRole('combobox'))
		await act(async () => {
			vi.advanceTimersByTime(250)
		})

		expect(listLocalEntries).toHaveBeenCalledWith({
			profileId: 'profile-1',
			path: undefined,
			limit: 300,
		})

		rerender(<LocalPathInput api={api} profileId="profile-2" value="" onChange={() => {}} />)

		await act(async () => {
			firstRequest.resolve({
				entries: [{ path: '/profile-1/stale', name: 'stale' }],
			})
			await Promise.resolve()
		})

		expect(Array.from(container.querySelectorAll('option')).map((node) => node.getAttribute('value'))).toEqual([])
	})
})
