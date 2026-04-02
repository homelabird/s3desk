import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { message } from 'antd'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { isDialogDismissed } from '../dialogPreferences'
import { ConfirmDangerDialog } from '../ConfirmDangerDialog'
import { ensureDomShims } from '../../test/domShims'

beforeAll(() => {
	ensureDomShims()
})

describe('ConfirmDangerDialog', () => {
	afterEach(() => {
		window.localStorage.clear()
		window.sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it('stores the dismissal preference in the dialog scope token even if the current token changes before submit', async () => {
		vi.spyOn(message, 'error').mockImplementation(() => undefined as never)

		window.sessionStorage.setItem('apiToken', JSON.stringify('token-a'))
		const onConfirm = vi.fn(async () => undefined)
		const onClose = vi.fn()

		render(
			<ConfirmDangerDialog
				title="Delete bucket"
				dialogPreferenceKey="confirm:Delete bucket|DELETE"
				scopeApiToken="token-a"
				onConfirm={onConfirm}
				onClose={onClose}
			/>,
		)

		fireEvent.click(screen.getByRole('checkbox', { name: /Do not show this confirmation again/i }))
		fireEvent.change(screen.getByPlaceholderText('DELETE'), { target: { value: 'DELETE' } })
		window.sessionStorage.setItem('apiToken', JSON.stringify('token-b'))
		fireEvent.click(screen.getByRole('button', { name: 'Delete' }))

		await waitFor(() => {
			expect(onConfirm).toHaveBeenCalledTimes(1)
			expect(onClose).toHaveBeenCalledTimes(1)
		})
		expect(isDialogDismissed('confirm:Delete bucket|DELETE', 'token-a')).toBe(true)
		expect(isDialogDismissed('confirm:Delete bucket|DELETE', 'token-b')).toBe(false)
	})
})
